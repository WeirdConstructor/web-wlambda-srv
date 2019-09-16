console.log("OK", [marked, m]);

var root = document.body;


var Entry = {
    oninit: function(vn) {
        vn.state.edit_mode = false;
        if (vn.attrs.entry == null) {
            vn.state.entry_id = vn.attrs.entry_id;
            m.request({ method: "GET", url: "/data/entries/" + vn.state.entry_id })
             .then(function(data) {
                 vn.state.entry = data;
             });
        } else {
            console.log("E:", vn.attrs.entry);
            vn.state.entry    = vn.attrs.entry;
            vn.state.entry_id = vn.attrs.entry.id;
        }
    },
    view: function(vn) {
        return m("div", "X:" + JSON.stringify(vn.state.entry));
    },
};

var RecentEntries = {
    oninit: function(vn) {
        vn.state.entries = [];
        m.request({ method: "GET", url: "/search/entries/recent"
        }).then(function(data) {
            console.dir(data);
            if (data == null) { data = []; }
            vn.state.entries = data;
        });
    },
    view: function(vn) {
        console.log("ENTRIES:", vn.state.entries);
        return m("div", [
            m("ul", vn.state.entries.map(function(e) {
                return m("li", m(Entry, { entry: e }))
            }))
        ]);
    },
};

var TopLevel = {
    oninit: function() {
        self.recent_entries = RecentEntries;
    },
    view: function() {
        return m("div", [
            m("div", "a"),
            m(RecentEntries),
            m("div", "b")
        ]);
    },
};

console.log("GO;", root);
m.mount(document.body, TopLevel);
//m.render(root, [
//    m("h2", { class: "title" }, "FUCK THIS!"),
//    m("p", { class: "content" },
//        m.trust(
//            marked("# Totally cool\n\nFU **CK**\n\n* a\n* b\n* c"))),
//]);
