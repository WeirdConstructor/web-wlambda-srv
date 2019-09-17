"use strict";
console.log("OK", [marked, m]);


const renderer = new marked.Renderer();
const doRenderCode = function(code, lang) {
    try {
        return lang ? hljs.highlight(lang, code, true).value : code;
//            hljs.highlightAuto(code).value;
    } catch (e) {
//        console.log("highlight error:", e);
        return code;
    }
}
renderer.code = function(code, lang) {
    if (lang) {
        return `<pre><code class="hljs ${lang || ''}">${doRenderCode(code, lang)}</code></pre>`
    } else {
        return "<pre>" + code + "</pre>";
    }
}
const markedOptions = {
    renderer: renderer,
   // langPrefix: 'hljs ',
   // highlight: (code, lang) => lang ? hljs.highlight(lang, code, true).value : hljs.highlightAuto(code).value
}

var root = document.body;

var c = 0;

var recent_entries = null;
var edit_entry_id = null;
var enable_entry_edit = false;

function get_recent_valid_entry_id() {
    if (recent_entries && recent_entries.length > 0) {
        let re = recent_entries.filter(e => !e.deleted);
        if (re[0]) {
            return re[0].id;
        }
    }
    return null;
}

function get_recent_entries() {
    m.request({ method: "GET", url: "/journal/search/entries/recent"
    }).then(function(data) {
        console.dir(data);
        if (data == null) { data = []; }
        recent_entries = data;

        if (recent_entries.length > 0) {
            edit_entry_id = get_recent_valid_entry_id();
        }
    });
}

function delete_entry() {
}

function new_entry() {
    m.request({ method: "POST", url: "/journal/data/entries", body: { tags: "new", body: "" } })
     .then(function(data) {
         console.log("NEW ENTRY:", data);
         get_recent_entries();
         edit_entry_id = data[0].new_entry_id;
         enable_entry_edit = true;
     });
}


var entries = {};
function get_entry_by_id(id) {
    if (!id) return null;

    if (entries[id]) {

    } else if (recent_entries) {
        recent_entries.map(function(e) {
            if (e.id == id) {
                entries[id] = new Entry(id, e);
            }
        });
        if (!entries[id]) {
            entries[id] = new Entry(id);
        }
    } else {
        entries[id] = new Entry(id);
    }

    return entries[id];
}

function padl(s, c, l) {
    while (s.length < l) { s = c + s; } 
    return s
}

class Entry {
    constructor(id, entry) {
        if (entry) {
            this.set_entry(entry)
        } else {
            this.load_entry_id(id)
        }
    }

    set_entry(entry) {
        this.entry    = entry;
        this.entry_id = entry.id;
        console.log("SET ENTRY:", entry);
    }

    load_entry_id(id) {
        let self = this;
        console.log("GET ENTRY:", id);
        if (self.entry_id == id) return;

        m.request({ method: "GET", url: "/journal/data/entries/" + id })
         .then(function(data) {
            self.set_entry(data);
         });
    }

    uncommitted_changes() {
        return this.changed;
    }

    del() {
        this.entry.deleted = 1;
        this.save();
        if (this.entry.id == edit_entry_id) {
            edit_entry_id = null;
        }
        get_recent_entries();
    }

    add_log() {
        let d = new Date();
        this.entry.body +=
            "    " + padl("" + d.getHours(), "0", 2)
             + ":" + padl("" + d.getMinutes(), "0", 2)
             + " [00:00] - \n";
        this.changed = true;
    }

    save() {
        let self = this;

        m.request({
            method: "POST",
            url: "/journal/data/entries/" + this.entry.id,
            body: this.entry
        }).then(function(data) {
            self.changed = false;
            console.log("SAVED ENTRY " + this.entry.id);
        });
    }

    set_tags(t) { if (this.entry.tags != t) this.changed = true; this.entry.tags = t; }
    set_body(b) { if (this.entry.body != b) this.changed = true; this.entry.body = b; }

    mtime() { return this.entry.mtime }
    ctime() { return this.entry.ctime }
    id() { return this.entry.id }
    body() { return this.entry.body }
    tags() { return this.entry.tags }
};

class EntryView {
    m_header(vn, entry) {
        let ht = [];
        if (vn.state.edit_mode) {
            ht.push(
                m("p", { class: "card-header-title" },
                    m("input",
                      { class: "input is-small",
                        type: "text",
                        value: entry.tags(),
                        oninput: function(e) { entry.set_tags(e.target.value); },
                        },
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
            ht.push(m("p", { class: "card-header-title" }, entry.tags()));
            ht.push(
                m("a", { class: "card-header-icon", href: "#",
                         ["aria-label"]: "more options",
                         onclick: function() {
                             if (vn.attrs.center_on_edit) {
                                 edit_entry_id = entry.id();
                                 enable_entry_edit = true;
                             } else {
                                 vn.state.edit_mode = true;
                             }
                         } },
                    m("span", { class: "icon" },
                        m("i", { class: "fas fa-edit", ["aria-hidden"]: "true" }))));
        }
        return m("header", { class: "card-header" }, [ ht ]);
    }

    view(vn) {
        let entry = get_entry_by_id(vn.attrs.entry_id);

        if (!entry) {
            return m("div", { class: "card" },
                m("header", { class: "card-header" }, [
                    m("div", { class: "card-header-icon" }, [
                        m("span", "[" + vn.attrs.entry_id + "]"),
                    ]),
                    m("div", { class: "card-header-title" }, [
                        m("progress",
                            { class: "progress is-small is-primary",
                              max: "100" },
                          "15%"),
                    ])]));
        }

        let card = [ this.m_header(vn, entry), ];

        if (enable_entry_edit) {
            vn.state.edit_mode = true;
            enable_entry_edit = false;
        }

        if (vn.state.edit_mode) {
            card.push(m("div", { class: "card-content", style: "padding: 0.5rem" },
                m("textarea",
                  { class: "textarea is-size-7 is-fullwidth is-family-monospace",
                    style: "min-height: 300px",
                    value: entry.body(),
                    oninput: function(e) {
                        entry.set_body(e.target.value);
                    } },
                  entry.body())));
        } else {
            if (entry.body()) {
                card.push(m("div", { class: "card-content", style: "padding: 0.5rem; padding-bottom: 0.3rem" },
                    m("div", { class: "content" },
                        m.trust(marked(entry.body(), markedOptions)))));
            }
        }

        let btn_class = "button is-outlined";
        if (entry.uncommitted_changes()) {
            btn_class += " is-danger";
        } else {
            btn_class += " is-primary";
        }

        card.push(m("div", { class: "card-content" },
            m("div", { class: "is-size-7 has-background-light columns" }, [
                m("div", {class: "column is-2 has-text-centered", style: "padding-top: 0.1rem; padding-bottom: 0.1rem" }, [
                    m("p", entry.id()),
                ]),
                m("div", {class: "column is-5 has-text-centered", style: "padding-top: 0.1rem; padding-bottom: 0.1rem" }, [
                    m("div", entry.mtime()),
                ]),
                m("div", {class: "column is-5 has-text-centered", style: "padding-top: 0.1rem; padding-bottom: 0.1rem" }, [
                    m("div", entry.ctime()),
                ])
            ])
        ));

        card.push(
            m("footer", { class: "card-footer" }, [
                m("div", { class: "card-footer-item is-size-7" },
                    m("button", { class: btn_class,
                                  onclick: function() { entry.add_log() } },
                        "Log")),
                m("div", { class: "card-footer-item is-size-7" },
                    m("button", { class: btn_class,
                                  onclick: function() { entry.save() } },
                        "Save")),
                m("div", { class: "card-footer-item is-size-7" },
                    m("button", { class: btn_class,
                                  onclick: function() { entry.del() } },
                        "Delete")),
            ]));

        return m("div", { class: "card" }, card)
    }
};

var RecentEntries = {
    oninit: function(vn) {
        if (!recent_entries) {
            get_recent_entries();
        }
    },
    view: function(vn) {
        console.log("RED RE:", recent_entries);
        if (recent_entries) {
            return m("div", {},
                recent_entries.filter(e => !e.deleted).map(function(e) {
                    return m("div", { class: "is-size-7", style: "margin-bottom: 0.75em" },
                        m(EntryView, { entry_id: e.id, center_on_edit: true }))
                }));
        } else {
            return m("div");
        }
    },
};

var TopLevel = {
    oninit: function(vn) {
        vn.state.body = "123";
        get_recent_entries();
    },
    view: function(vn) {
        return m("section", { class: "section" }, [
//            m("div", { class: "container" }, [
                m("div", { class: "columns is-3" }, [
                    m("div", { class: "column" },  [
                        m("button", { class: "button is-primary", style: "margin-bottom: 1rem", onclick: function() { new_entry() } }, "New"),
                        m(EntryView, { entry_id: edit_entry_id }),
                    ]),
                    m("div", { class: "column" }, "Search Column Here"),
                    m("div", { class: "column" },  m(RecentEntries)),
                ]),
//            ]),
        ]);
    },
};

document.addEventListener("keypress", function(e) {
    if (e.getModifierState("Control")) {
        console.log("Ctrl+Keypress", e.key);
        switch (e.key) {
            case "Enter":
                let ent = get_entry_by_id(edit_entry_id);
                console.log("RERE", e);
                if (ent) ent.save();
                m.redraw();
                e.preventDefault();
                break;
        }
    }
});

//console.log(marked(markdownStr, markedOptions))
//hljs.initHighlightingOnLoad();
console.log("GO;", root);
m.mount(document.body, TopLevel);
