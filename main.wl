!@import u util;

!@import a auth;

!:global auth_realm     = \ "wctor_journal" ;
!:global local_endpoint = \ "0.0.0.0:19099" ;
!:global file_prefix    = { || "/journal/files" };
!:global need_auth      = { || $t };
!:global auth           = { a:auth[[@]] };

!parse_tags = {
    !tags = _;
    tags | std:re:map $q/\s*("(.*?)"|[^,]+)\s*/ {
        !m = _;
        (is_none m.2) { m.1 } { m.2 }
    }
};

!save_search = {
    db:exec $q"DELETE FROM searches WHERE search=?" _;
    db:exec $q"INSERT INTO searches (search) VALUES(?)" _;
};

!get_search = {
    !r = db:exec $q"SELECT search FROM searches ORDER BY id DESC LIMIT 1";
    r.0
};

!:global req = {
    !(method, path, data) = @;

    !data = block :from_req {
        !t = std:str:cat method ":" path;
        u:regex_match t $[
            $q"^GET:/journal/search/last", {||
                return :from_req get_search[];
            },
            $q"^GET:/journal/search/entries/recent", {||
                return :from_req ~
                    db:exec $q"SELECT * FROM entries e
                               ORDER BY mtime DESC, id DESC
                               LIMIT 25";
            },
            $q"^POST:/journal/fileupload/(\d+)", {||
                !entry_id = _.1;
                !d = data.data;
                std:re:match $q$;base64,(.*)$ d {
                    _? :from_req ~
                        write_webdata
                            (std:str:cat entry_id "_" data.name)
                            (b64:decode _.1);
                };
                return :from_req ~ $["ok"];
            },
            $q"^POST:/journal/search/entries", {||
                save_search data.search;
                !args = $[];
                (not ~ is_none data.search) {
                    !s = u:search_to_sql ~ u:parse_search data.search;
                    std:displayln :SQL_SEARCH " " s;
                    std:push args s.sql;
                    std:append args s.binds;
                } {
                    std:push args
                        $q"SELECT * FROM entries WHERE deleted=0 ORDER BY mtime DESC LIMIT 40"; 
                };
                return :from_req ~ db:exec[[args]];
            },
            $q"^GET:/journal/data/entries/(\d+)", {||
                return :from_req ~
                    0 ~ db:exec $q"SELECT * FROM entries WHERE id=?" _.1;
            },
            $q"^GET:/journal/data/entries", {||
                return :from_req ~
                    db:exec $q"SELECT * FROM entries
                               WHERE deleted=0
                               ORDER BY id DESC
                               LIMIT 50";
            },
            $q"^POST:/journal/data/entries/(\d+)", {||
                !entry_id = _.1;
                std:displayln "DATA SAVE:" _ data;

                (not ~ is_none data.mtime) {
                    !mt =_? :from_req ~
                        db:exec $q"SELECT id, mtime FROM entries WHERE
                                   id = ? AND mtime > ?" data.id data.mtime;
                    (not ~ is_none mt.0.mtime) {
                        std:displayln "OUT OF DATE: " mt.0 data;
                        return :from_req $e ${
                            status = 403,
                            data = $["outofdate", std:ser:json data]
                        };
                    }
                };

                _? :from_req ~
                    db:exec
                        "UPDATE entries SET tags=?,body=?,deleted=?,mtime=datetime('now') WHERE id=?"
                        data.tags
                        data.body
                        (is_none data.deleted)[{ 0 }, { data.deleted }]
                        entry_id;
                !tag_vec = parse_tags data.tags;
                !tag_ids = tag_vec {
                    _? :from_req ~
                        db:exec "INSERT OR IGNORE INTO tags (name) VALUES(?)" _;
                    !r = _? :from_req ~
                        db:exec "SELECT id FROM tags WHERE name=?" _;
                    r.(0).id
                };
                _? :from_req ~ db:exec
                    $q"DELETE FROM tag_entries WHERE entry_id=?"
                    entry_id;
                tag_ids {
                    _? :from_req ~
                        db:exec
                            $q"INSERT INTO tag_entries (tag_id, entry_id)
                               VALUES(?,?)" _ entry_id;
                };

                !e = _? :from_req ~
                    db:exec "SELECT * FROM entries WHERE id=?" entry_id;
                std:displayln "SAVE ENTRY" e;
                return :from_req $[ "ok", entry_id, e.0 ];
            },
            $q"^POST:/journal/data/entries", {||
                std:displayln "POST NEW" data;

                _? :from_req ~
                    db:exec
                        "INSERT INTO entries (tags, body) VALUES(?,?)"
                        data.tags data.body;
                !e = _? :from_req ~
                    db:exec "SELECT MAX(id) AS new_entry_id FROM entries";
                !new_entry_id = e.(0).new_entry_id;
                !tag_vec = parse_tags data.tags;
                !tag_ids = tag_vec {
                    _? :from_req ~
                        db:exec "INSERT OR IGNORE INTO tags (name) VALUES(?)" _;
                    !r = _? :from_req ~
                        db:exec "SELECT id FROM tags WHERE name=?" _;
                    r.(0).id
                };
                tag_ids {
                    _? :from_req ~
                        db:exec
                            $q"INSERT INTO tag_entries (tag_id, entry_id)
                               VALUES(?,?)" _ new_entry_id;
                };
                return :from_req e;
            },
            $q"^GET:/journal/data/entries/(\d+)", {
                return :from_req ~
                    db:exec "SELECT * FROM entries WHERE id=?" _.1;
            },
        ];
        $e $["No URL Handler!", t]
    };

    (is_err data) {
        std:displayln :ERROR " " data;
        (is_map ~ unwrap_err data) { unwrap_err data } { data };
    } { ${ data = data } };
};

!setup_db = {
    db:connect_sqlite "j.sqlite";
    db:exec $q"
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY,
            tags TEXT NOT NULL DEFAULT '',
            ctime TEXT DEFAULT (datetime('now')),
            mtime TEXT DEFAULT (datetime('now')),
            body TEXT NOT NULL DEFAULT '',
            deleted INTEGER NOT NULL DEFAULT 0
        );
    ";

    db:exec $q"
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE
        );
    ";

    db:exec $q"
        CREATE TABLE IF NOT EXISTS tag_entries (
            tag_id INTEGER,
            entry_id INTEGER,
            FOREIGN KEY(tag_id) REFERENCES tags(id),
            FOREIGN KEY(entry_id) REFERENCES entries(id)
        );
    ";

    db:exec $q"
        CREATE TABLE IF NOT EXISTS system (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    ";

    db:exec $q"
        CREATE TABLE IF NOT EXISTS searches (
            id INTEGER PRIMARY KEY,
            search TEXT
        );
    ";

    !r = db:exec "SELECT value FROM system WHERE key=?" :version;
    std:displayln "* db version = " r.0.value;
    (not r) {
        db:exec "INSERT INTO system (key, value) VALUES(?, ?)" :version "1";
    } {
    };
};

setup_db[];
