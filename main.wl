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
            $q"^GET:/journal/attachments/(\d+)", {||
                return :from_req ~
                    db:exec "SELECT * FROM attachments WHERE entry_id=?" _.1;
            },
            $q"^GET:/journal/search/entries/recent", {||
                return :from_req ~
                    db:exec $q"SELECT * FROM entries e
                               ORDER BY mtime DESC, id DESC
                               LIMIT 25";
            },
            $q"^GET:/journal/trigger_attachment_thumb/(\d+)", {||
                !at = db:exec "SELECT * FROM attachments WHERE id=?" _.1
                    | _? :from_req;
                !local_filename_thumb =
                    std:str:cat at.0.entry_id "_tb_" at.0.id "_" at.0.name;
                std:re:match "^image/" at.0.type {||
                    make_webdata_thumbnail
                        (std:str:cat "attachments/" at.0.local_filename)
                        (std:str:cat "attachments/" local_filename_thumb)
                        | _? :from_req;
                    db:exec
                        "UPDATE attachments SET local_thumb_filename=? WHERE id=?"
                            local_filename_thumb at.0.id
                        | _? :from_req;
                };
                return :from_req $["ok", at];
            },
            $q"^GET:/journal/deleteupload/(\d+)", {||
                db:exec "DELETE FROM attachments WHERE id=?" _.1 | _? :from_req;
                return :from_req $["ok"];
            },
            $q"^POST:/journal/sliceupload/(\d+)", {||
                !at = _? :from_req ~ db:exec
                    "SELECT local_filename FROM attachments WHERE id=?" _.1;
                (is_some at.0.local_filename) {
                    !d = data.data;
                    std:re:match $q$;base64,(.*)$ d {
                        _? :from_req ~
                            append_webdata
                                (std:str:cat "attachments/" at.0.local_filename)
                                (b64:decode _.1);
                    };
                };
                return :from_req $[_.1];
            },
            $q"^POST:/journal/fileupload/(\d+)", {||
                !entry_id = _.1;

                _? :from_req ~ db:exec
                    "INSERT INTO attachments (entry_id, name, type) VALUES(?, ?, ?)"
                    entry_id data.name data.type;

                !at_id = _? :from_req ~
                    db:exec "SELECT MAX(id) AS new_at_id FROM attachments";

                !local_filename =
                    std:str:cat entry_id "_" at_id.0.new_at_id "_" data.name;

                _? :from_req ~ db:exec
                    "UPDATE attachments SET local_filename=? WHERE id=?"
                        local_filename at_id.0.new_at_id;

                !d = data.data;
                std:re:match $q$;base64,(.*)$ d {
                    _? :from_req ~
                        write_webdata
                            (std:str:cat "attachments/" local_filename)
                            (b64:decode _.1);
                };
                return :from_req ~ $[at_id.0.new_at_id];
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

                # check whether the to be saved entry is out of date:
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

                # save diff to history:
                !old = db:exec "SELECT * FROM entries WHERE id=?" entry_id
                    | _? :from_req;
                !diff = text_diff old.0.body data.body;
                !hist_num =
                    db:exec
                        "SELECT MAX(hist_num) AS hist_num FROM history WHERE entry_id=?" entry_id
                    | _? :from_req;
                !out_hist_num = $&$n;
                (is_some hist_num)
                    { .out_hist_num = hist_num.0.hist_num + 1 }
                    { .out_hist_num = 1 };
                std:displayln :FFFFF " " $*out_hist_num;
                db:exec
                    $q$
                        INSERT INTO history (entry_id, hist_num, tags, body, mtime)
                        VALUES(?, ?, ?, ?, ?)
                    $ entry_id $*out_hist_num old.0.tags (u:diff2txt diff) old.0.mtime
                | _? :from_req;

                # update entry:
                _? :from_req ~
                    db:exec
                        "UPDATE entries SET tags=?,body=?,deleted=?,mtime=datetime('now') WHERE id=?"
                        data.tags
                        data.body
                        (is_none data.deleted)[{ 0 }, { data.deleted }]
                        entry_id;

                # recreate tag structure:
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
        std:displayln :ERROR " " (unwrap_err data | str);
        (is_map ~ unwrap_err data) { unwrap_err data } {
            ${
                status       = 500,
                content_type = "text/plain",
                body         = unwrap_err data,
            }
        };
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

    !r = unwrap ~ db:exec "SELECT value FROM system WHERE key=?" :version;
    !version = r.0.value;
    std:displayln "* db version = " version;
    (not r) {
        unwrap ~ db:exec "INSERT INTO system (key, value) VALUES(?, ?)" :version "1";
    } {
        !new_version = $&$n;

        (version == "1") {
            .new_version = "2";
            unwrap ~ db:exec $q"
                CREATE TABLE IF NOT EXISTS attachments (
                    id INTEGER PRIMARY KEY,
                    entry_id INTEGER,
                    upload_time TEXT NOT NULL DEFAULT (datetime('now')),
                    type TEXT,
                    name TEXT,
                    local_filename TEXT,
                    local_thumb_filename TEXT,
                    FOREIGN KEY (entry_id) REFERENCES entries(id)
                );
            ";
        };

        (version == "2") {
            .new_version = "3";
            unwrap ~ db:exec $q"
                CREATE TABLE IF NOT EXISTS history (
                    entry_id INTEGER,
                    hist_num INTEGER,
                    mtime TEXT NOT NULL DEFAULT (datetime('now')),
                    tags TEXT,
                    body TEXT,
                    FOREIGN KEY (entry_id) REFERENCES entries(id),
                    PRIMARY KEY (entry_id, hist_num)
                );
            ";
        }

        (is_some $*new_version) {
            db:exec "UPDATE system SET value=? WHERE key=?" new_version :version;
            std:displayln "UPDATED DATABASE FROM " version " to " new_version;
        };
    };
};

setup_db[];
