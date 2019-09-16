console.log("OK", [marked, m]);

var root = document.body;

var c = 0;

var Entry = {
    oninit: function(vn) {
        vn.state.cid = c;
        c += 1;
        vn.state.edit_mode = true;
        if (vn.attrs.entry == null) {
            vn.state.entry_id = vn.attrs.entry_id;
            m.request({ method: "GET", url: "/data/entries/" + vn.state.entry_id })
             .then(function(data) {
                 vn.state.entry = data;
                 vn.state.body = data.body;
                 vn.state.tags = data.tags;
             });
        } else {
            console.log("E:", vn.attrs.entry);
            vn.state.entry    = vn.attrs.entry;
            vn.state.entry_id = vn.attrs.entry.id;
            vn.state.body = vn.state.entry.body;
            vn.state.tags = vn.state.entry.tags;
        }
    },
//    m_card: function(blocks) {
//    },
//    m_field: function(el) {
//        return m("div", { class: "field" },
//                  m("div", { class: "control" }, el));
//    },
    body_changed: function(vn, value) {
        console.log("CHANGE", [vn.state.cid, value]);
        vn.state.body = value;
    },
    tags_changed: function(vn, value) {
        console.log("CHANGE TAGS", [vn.state.cid, value]);
        vn.state.tags = value;
    },
    m_header: function(vn) {
        let ht = [];
        if (vn.state.edit_mode) {
            ht.push(
                m("p", { class: "card-header-title" },
                    m("input",
                      { class: "input is-small",
                        type: "text",
                        value: vn.state.tags,
                        onchange: function(e) {
                            vn.state.tags_changed(vn, e.target.value);
                        } },
                      "")));
            ht.push(
                m("a", { class: "card-header-icon", href: "#",
                         ["aria-label"]: "more options",
                         onclick: function() {
                             vn.state.edit_mode = false;
                         } },
                    m("span", { class: "icon" },
                        m("i", { class: "fas fa-file", ["aria-hidden"]: "true" }))));
        } else {
            ht.push(m("p", { class: "card-header-title" }, vn.state.tags));
            ht.push(
                m("a", { class: "card-header-icon", href: "#",
                         ["aria-label"]: "more options",
                         onclick: function() {
                             vn.state.edit_mode = true;
                         } },
                    m("span", { class: "icon" },
                        m("i", { class: "fas fa-edit", ["aria-hidden"]: "true" }))));
        }
        return m("header", { class: "card-header" }, [ ht ]);
    },
    view: function(vn) {
        let card = [ this.m_header(vn), ];

        if (vn.state.edit_mode) {
        console.log("REDRAW TA", [ vn.state ]);
            card.push(m("div", { class: "card-content" },
                m("textarea",
                  { class: "textarea is-fullwidth",
                    value: vn.state.body,
                    oninput: function(e) {
                        vn.state.body_changed(vn, e.target.value);
                    } },
                  vn.state.body)));
        } else {
            card.push(m("div", { class: "card-content" },
                m("div", { class: "content" },
                    m.trust(
                        marked(vn.state.body)))));
        }
        card.push(
            m("footer", { class: "card-footer" }, [
                m("div", { class: "card-footer-item is-size-7" },
                  vn.state.cid),
                m("div", { class: "card-footer-item is-size-7" },
                  vn.state.entry.mtime),
                m("div", { class: "card-footer-item is-size-7" },
                  vn.state.entry.ctime)
            ]));
        return m("div", { class: "card" }, card)
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
    oninit: function(vn) {
        vn.state.body = "123";
    },
    body_changed: function(vn, v) {
        console.log("SET:", [vn.state.body, v]);
        vn.state.body = v;
    },
    view: function(vn) {
        console.log("DRAW;", vn.state);
        return m("div", [
            m("div", "a"),
            m(RecentEntries),
            m("div", "b")
        ]);
    },
};

console.log("GO;", root);
m.mount(document.body, TopLevel);
