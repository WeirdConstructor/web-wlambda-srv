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

!:global req = {
    !(method, path, data) = @;

    !data = block :from_req {
        !t = std:str:cat method ":" path;
        u:regex_match t $[
            $q"^GET:/journal/search/entries/recent", {||
                return :from_req ~
                    db:exec $q"SELECT * FROM entries e
                               ORDER BY mtime DESC, id DESC
                               LIMIT 25";
            },
            $q"^POST:/journal/search/entries", {||
                !stmt = $[];
                std:push stmt
                    $q"SELECT * FROM entries WHERE id IN
                       (SELECT DISTINCT e.id FROM entries e
                        LEFT JOIN tag_entries te ON e.id = te.entry_id
                        LEFT JOIN tags t ON t.id = te.tag_id
                        WHERE (e.deleted <> 1)";

                !args = $[];
                (not ~ is_none data.search) {
                    !sql_srch = u:search_to_sql data.search
                        "t.name" "(e.tags || ' ' || e.body)" "mtime" "ctime";

                    (sql_srch != "") {
                        std:push stmt "AND";
                        std:push stmt sql_srch.where;
                    };
                    std:push stmt ")";
                    (not ~ is_none sql_srch.order) {
                        std:push stmt "ORDER BY ";
                        std:push stmt sql_srch.order;
                    };
                    std:push stmt " LIMIT 25";
                    std:append args sql_srch.binds;
                } {
                    std:push stmt ")";
                };
                !stmt = std:str:join " " stmt;
                std:displayln "SEARCH: " stmt;
                std:prepend args stmt;
                return :from_req ~ db:exec[[args]];
            },
            $q"^GET:/journal/data/entries/(\d+)", {||
                return :from_req ~
                    0 ~ db:exec $q"SELECT * FROM entries WHERE id=?" _.1;
            },
            $q"^GET:/journal/data/entries", {||
                return :from_req ~
                    db:exec $q"SELECT * FROM entries
                               ORDER BY id DESC
                               LIMIT 25";
            },
            $q"^POST:/journal/data/entries/(\d+)", {||
                !entry_id = _.1;
                std:displayln "DATA SAVE:" _ data;

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
                return :from_req [ "ok", entry_id ];
            },
            $q"^POST:/journal/data/entries", {||
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
        $e "No URL Handler!"
    };

    (is_err data) { data }
    { ${ data = data } };
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

    !r = db:exec "SELECT value FROM system WHERE key=?" :version;
    std:displayln "* db version = " r.(0).value;
    (not r) {
        db:exec "INSERT INTO system (key, value) VALUES(?, ?)" :version "1";
    };
};

setup_db[];
