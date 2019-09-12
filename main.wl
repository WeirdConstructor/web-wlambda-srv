!:global auth_realm = { "wctor_journal" };
!:global local_endpoint = { "0.0.0.0:19099" };
!:global auth = { !(method, path, auth) = @;
    auth.1 == "wctor:******"
};
!:global req = { !(method, path, data) = @;
    block :req {
        !t = str:cat method ":" path;
        re:match $q"^POST:/search/entries" t {
            displayln :get_entry_list _;
            displayln :GOO: data;
        };
        re:match $q"^GET:/data/entries" t {||
            return :req ~ db:exec "SELECT * FROM entries ORDER BY ctime DESC LIMIT 25";
        };
        re:match $q"^POST:/data/entries" t {||
            db:exec
                "INSERT INTO entries (tags, body) VALUES(?,?)"
                data.tags data.body;
            !e = db:exec "SELECT MAX(id) AS new_entry_id FROM entries";
            return :req e;
        };
        re:match $q"^GET:/data/entries/(\d+)" t {
            displayln :getentry _.1;
        };
    }
};


!setup_db = {
    db:connect_sqlite "journal.sqlite";
    db:exec $q"
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY,
            ctime TEXT DEFAULT (datetime('now')),
            mtime TEXT DEFAULT (datetime('now')),
            tags TEXT,
            body TEXT
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
    displayln "* db version = " r.(0).value;
    (not r) {
        db:exec "INSERT INTO system (key, value) VALUES(?, ?)" :version "1";
    };
};

setup_db[];
