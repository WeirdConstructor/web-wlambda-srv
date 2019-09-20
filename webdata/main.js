"use strict";

///
/// Setup marked.js renderer
///

const renderer = new marked.Renderer();
const doRenderCode = function(code, lang) {
    try {
        return lang ? hljs.highlight(lang, code, true).value : code;
    } catch (e) {
        return code;
    }
}

renderer.code = function(code, lang) {
    if (lang) {
        return `<pre><code class="hljs ${lang || ''}">${doRenderCode(code, lang)}</code></pre>`
    } else {
        return "<pre>" + code + "</pre>";
    }
};

var listitem_rendered_entry;
var listitem_checkbox_index;

function before_calling_marked_with_entry(entry) {
    listitem_checkbox_index = 0;
    listitem_rendered_entry = entry;
}

renderer.checkbox = function(checked) {
    let value = checked ? "checked=\"1\"" : "";
    let idx = listitem_checkbox_index;
    listitem_checkbox_index = listitem_checkbox_index + 1;
    return ("<input checkidx=\"" + idx + "\" entry_id=\""
        + listitem_rendered_entry.id()
        + "\" style=\"margin-right: 0.5rem\" type=\"checkbox\" "
        + value + " oninput=\"checkbox_input(this)\">");
}

renderer.link = function(href, title, text) {
    let m = href.match(/^ent:(\d+)$/);
    if (m) {
        return "<a href=\"#!/entry/" + m[1] + "\" alt=\"entry " + m[1] + "\">[entry " + m[1]  + "]</a>";
    } else {
        return "<a href=\"" + href + "\" alt=\"" + title + "\">" + text + "</a>";
    }
};

renderer.listitem = function(text, task, checked) {
    if (task) {
        return (
            "<li style=\"list-style: none\"><label class=\"checkbox\">" 
            + text + "</label></li>");
    } else {
        return "<li>" + text + "</li>";
    }
}

const markedOptions = { renderer: renderer, }

var root = document.body;

var c = 0;

var recent_entries = null;
var edit_entry_id = null;
var enable_entry_edit = false;
var new_entry_tags = null;
var modal = null;

window.checkbox_input = function(e, v) {
    let entry_id = parseInt(e.attributes.getNamedItem("entry_id").nodeValue);
    if (!entry_id || !(entry_id > 0))
        return;
    let check_idx = parseInt(e.attributes.getNamedItem("checkidx").nodeValue);
    if (!entry_id || !(entry_id > 0))
        return;
    let entry = get_entry_by_id(entry_id);
    entry.set_checkbox(check_idx, e.parentElement.innerText, !!e.checked);
    m.redraw();
};

function padl(s, c, l) {
    while (s.length < l) { s = c + s; } 
    return s
}

function get_day() {
    let d = new Date();
    return (
                padl("" + (d.getYear() + 1900),"0", 4)
        + "-" + padl("" + (d.getMonth() + 1),  "0", 2)
        + "-" + padl("" + (d.getDate() + 1),       "0", 2));
}

function get_recent_valid_entry_id() {
    if (recent_entries && recent_entries.length > 0) {
        let re = recent_entries.filter(e => !e.deleted);
        if (re[0]) {
            return re[0].id;
        }
    }
    return null;
}

function goto_entry(id) {
    console.log("GOTO ENTRY:", [id]);
    m.route.set("/entry/:id", { id: id });
    enable_entry_edit = true;
    document.getElementById("top").scrollIntoView();
}

function get_recent_entries() {
    m.request({ method: "GET", url: "/journal/search/entries/recent"
    }).then(function(data) {
        console.dir(data);
        if (data == null) { data = []; }
        recent_entries = data;

        if (recent_entries.length > 0 && edit_entry_id == null) {
            goto_entry(get_recent_valid_entry_id());
        }
    });
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}


function open_diary() {
    search(get_day(), function(entries) {
        if (entries && entries.length > 0) {
            entries.map(function(e) { load_cache(e.id, e) });
            goto_entry(entries[0].id);
        } else {
            new_entry(function(entry_id) {
                new_entry_tags = [entry_id, get_day() + ", timelog, diary"];
            });
        }
    });
}

function new_entry(cb) {
    m.request({
        method: "POST",
        url: "/journal/data/entries",
        body: { tags: "new", body: "" }
    }).then(function(data) {
        console.log("NEW ENTRY:", data);
        get_recent_entries();
        goto_entry(data[0].new_entry_id);
        if (cb) cb(data[0].new_entry_id);
    });
}

function load_cache(id, e) {
    if (e) {
        entries[id] = new Entry(id, e);
    } else {
        entries[id] = new Entry(id);
    }
}

var entries = {};
function get_entry_by_id(id) {
    if (!id) return null;

    if (entries[id]) {

    } else if (recent_entries) {
        recent_entries.map(function(e) {
            if (e.id == id) {
                load_cache(id, e);
            }
        });
        if (!entries[id]) {
            load_cache(id);
        }
    } else {
        load_cache(id);
    }

    return entries[id];
}

let checkbox_re = /-\s+\[.\]\s+(.*)/g;
let time_log_re = /^\s+(\d+):(\d+)\s+\[\d+:\d+\] -/;
let time_log_repl_re = /^(\s+\d+:\d+\s+)(\[\d+:\d+\]) -/;

class Entry {
    constructor(id, entry) {
        console.log("CONSTR ENTR:", [id, entry]);
        if (entry) {
            this.set_entry(entry)
        } else {
            this.load_entry_id(id)
        }
    }

    set_entry(entry) {
        this.entry    = entry;
        this.entry_id = entry.id;

        if (new_entry_tags && new_entry_tags[0] == entry.id) {
            this.set_tags(new_entry_tags[1]);
            new_entry_tags = null;
        }
        console.log("SET ENTRY:", entry);
    }

    load_entry_id(id) {
        let self = this;
        self.entry = { body: "loading...", tags: "loading..." };
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

    ask_del() {
        let self = this;
        modal = {
            text: "Really delete?",
            cb: function () { self.del(); },
        };
    }

    del() {
        let self = this;
        this.entry.deleted = 1;
        this.save(function() {
            if (self.entry.id == edit_entry_id) {
                edit_entry_id = null;
                m.route.set("/main");
                enable_entry_edit = false;
            }
            get_recent_entries();
        });
    }

    is_edited_entry() {
        if (!this.entry) return false;
        return this.entry.id == edit_entry_id;
    }

    set_checkbox(idx, text, checked) {
        let ts = this.get_timestamp();
        let i = 0;
        this.entry.body = this.entry.body.replace(checkbox_re, function(l, txt) {
        console.log("RR", [l, txt, i, idx]);
            if (idx == i) {
                txt = txt.replace(/\s*\(\d+-\d+-\d+ \d+:\d+:\d+\)$/, "");
                if (checked) {
                    l = "- [x] " + txt + " (" + ts + ")";
                } else {
                    l = "- [ ] " + txt;
                }
            }
            i = i + 1;
            return l;
        });
        this.changed = true;
    }

    make_sure_newline_at_end() {
        this.entry.body = this.entry.body.replace(/[\r\n]*$/, "\n");
        this.changed = true;
    }

    add_log() {
        let d = new Date();
        this.make_sure_newline_at_end();
        this.entry.body +=
            "    " + padl("" + d.getHours(), "0", 2)
             + ":" + padl("" + d.getMinutes(), "0", 2)
             + " [00:00] - \n";
        this.changed = true;
    }

    get_timestamp() {
        let d = new Date();
        return (
                    padl("" + (d.getYear() + 1900),"0", 4)
            + "-" + padl("" + (d.getMonth() + 1),  "0", 2)
            + "-" + padl("" + (d.getDate()),       "0", 2)
            + " " + padl("" + (d.getHours()),      "0", 2)
            + ":" + padl("" + (d.getMinutes()),    "0", 2)
            + ":" + padl("" + (d.getSeconds()),    "0", 2));
    }

    add_todo() {
        let d = new Date();
        this.make_sure_newline_at_end();
        this.entry.body += "- [ ] \n";
        this.changed = true;
    }

    save(done_cb) {
        let self = this;

        m.request({
            method: "POST",
            url: "/journal/data/entries/" + this.entry.id,
            body: this.entry
        }).then(function(data) {
            self.changed = false;
            if (done_cb) done_cb();
        });
    }

    set_tags(t) { if (this.entry.tags != t) this.changed = true; this.entry.tags = t; }
    set_body(b) { if (this.entry.body != b) this.changed = true; this.entry.body = b; }

    mtime() { return this.entry.mtime }
    ctime() { return this.entry.ctime }
    id()    { return this.entry.id }
    body()  { return this.entry.body }
    tags()  { return this.entry.tags }

    set_tags(tstr) {
        this.entry.tags = tstr;
        this.changed = true;
    }

    full_body()  {
        let v = this.entry.body.split(/\n/);
        let last_time = null;
        return v.map(function(l) {
            let m = l.match(time_log_re);
            if (m) {
                let time = [parseInt(m[1]), parseInt(m[2])];
                if (last_time) {
                    let last_mins_of_day = last_time[0] * 60 + last_time[1];
                    let cur_mins_of_day  = time[0] * 60 + time[1];
                    let diff = cur_mins_of_day - last_mins_of_day;
                    let hours = Math.floor(diff / 60);
                    let mins = diff - hours * 60;
                    let sum = (
                        "[" + padl("" + hours, "0", 2) + ":"
                            + padl("" + mins, "0", 2) + "]");
                    l = l.replace(time_log_repl_re, "$1" + sum + " -");
                }
                last_time = time;
            }
            return l;
        }).join("\n")
    }


    short_body() {
        let v = this.entry.body.split(/\n/);
        let out = [];
        for (let i = 0; i < 10; i++) {
            out.push(v[i]);
        }
        return [out.join("\n"), v.length > 10];
    }

    rendered_body(show_full, vn) {
        let body;
        let cont_link = false;
        if (show_full) {
            body = this.full_body();
        } else {
            let r = this.short_body();
            body = r[0];
            cont_link = r[1];
        }

        return [
            m.trust(marked(body, markedOptions)),
            (cont_link
                ? m("a", { onclick: function(e) {
                        e.preventDefault();
                        vn.state.show_full = true;
                    } }, "...")
                : m("span"))
        ]
    }
};

function m_icon_btn(icon_class, cb) {
    return m("a", { class: "card-header-icon",
                    style: "padding: 0.5rem",
                    href: "#!",
                    ["aria-label"]: "more options",
                    onclick: function(ev) { ev.preventDefault(); cb(ev) } },
        m("span", { class: "icon" },
            m("i", { class: icon_class, ["aria-hidden"]: "true" })));
}

class EntryView {
    m_header(vn, entry) {
        let ht = [];
        if (vn.state.edit_mode) {
            ht.push(
                m("p", { class: "card-header-title", style: "padding: 0.5rem" },
                    m("input",
                      { class: "input is-small",
                        type: "text",
                        value: entry.tags(),
                        oninput: function(e) { entry.set_tags(e.target.value); },
                        },
                      "")));
            ht.push(m_icon_btn(
                "fas fa-level-up-alt", function() {
                     goto_entry(entry.id());
                }));
            ht.push(m_icon_btn(
                "fas fa-file", function() { vn.state.edit_mode = false; }));
        } else {
            ht.push(m("p", { class: "card-header-title", style: "padding: 0.5rem" },
                      entry.tags()));

            if (!entry.is_edited_entry()) {
                if (vn.state.show_full) {
                    ht.push(m_icon_btn(
                        "fas fa-angle-up",
                        function() { vn.state.show_full = false; }));
                } else {
                    ht.push(m_icon_btn(
                        "fas fa-angle-down",
                        function() { vn.state.show_full = true; }));
                }
            }
            ht.push(m_icon_btn(
                "fas fa-level-up-alt", function() {
                     goto_entry(entry.id());
                }));
            ht.push(m_icon_btn(
                "fas fa-edit", function() {
                     vn.state.edit_mode = true;
                }));
        }

        return m("header", { class: "card-header" }, [ ht ]);
    }

    view(vn) {
        let entry = get_entry_by_id(vn.attrs.entry_id);

        let id = vn.attrs.is_top_editor ? "top_editor" : null;

        if (!entry) {
            return m("div", { class: "card", id: id },
                m("header", { class: "card-header" }, [
                    m("div", { class: "card-header-icon" }, [
                        m("span", "[" + vn.attrs.entry_id + "]"),
                    ]),
                    m("div", { class: "card-header-title",
                               style: "padding: 0.5rem" }, [
                        m("progress",
                            { class: "progress is-small is-primary",
                              max: "100" },
                          "15%"),
                    ])]));
        }

        let tint_class = "is-primary";
        if (entry.uncommitted_changes()) {
            tint_class = "is-danger";
        }

        let show_full = (
            entry.is_edited_entry()
            || entry.uncommitted_changes()
            || vn.state.show_full
            || vn.state.edit_mode);

        if (enable_entry_edit) {
            vn.state.edit_mode = true;
            enable_entry_edit = false;
        }

        let card = [ this.m_header(vn, entry), ];

        if (vn.state.edit_mode) {
            card.push(m("div", { class: "card-content", style: "padding: 0.5rem" },
                m("textarea",
                  { class: "textarea is-size-7 is-fullwidth is-family-monospace "
                           + tint_class,
                    style: "min-height: 300px",
                    value: entry.body(),
                    oninput: function(e) {
                        entry.set_body(e.target.value);
                    } },
                  entry.body())));

        } else {
            if (entry.body()) {
                before_calling_marked_with_entry(entry);

                let body_array = entry.rendered_body(show_full, vn);

                let content = m("div", { class: "card-content",
                                         style: "padding: 0.5rem" },
                    m("div", { class: "content" }, body_array));

                if (entry.uncommitted_changes()) {
                    content = m("div", { style: "border: 1px solid red" },
                                content);
                }
                card.push(content);
            }
        }

        let btn_class = "button is-outlined " + tint_class;

        if (show_full) {
            card.push(m("div", { class: "card-content",
                                 style: "padding: 0" },
                m("div", { class: "is-size-7 has-background-light columns", style: "margin: 0" }, [
                    m("div", { class: "column is-2 has-text-centered",
                               style: "padding-top: 0.1rem; padding-bottom: 0.1rem" }, [
                        m("div", entry.id()),
                    ]),
                    m("div", { class: "column is-5 has-text-centered",
                               style: "padding-top: 0.1rem; padding-bottom: 0.1rem" }, [
                        m("div", entry.mtime()),
                    ]),
                    m("div", { class: "column is-5 has-text-centered",
                               style: "padding-top: 0.1rem; padding-bottom: 0.1rem" }, [
                        m("div", entry.ctime()),
                    ])
                ])
            ));

            card.push(
                m("footer", { class: "card-footer" }, [
                    m("div", { class: "card-footer-item is-size-7" },
                        m("div", { class: "buttons has-addons is-centered" }, [
                            m("button", { class: btn_class,
                                          onclick: function() { entry.add_log() } },
                                "Log"),
                            m("button", { class: btn_class,
                                          onclick: function() { entry.add_todo() } },
                                "Todo"),
                        ])),
                    m("div", { class: "card-footer-item is-size-7" },
                        m("div", { class: "buttons has-addons is-centered" }, [
                            m("button", { class: btn_class,
                                          onclick: function() { entry.save() } },
                                "Save"),
                            m("button", { class: btn_class,
                                          onclick: function() {
                                             vn.state.edit_mode = false;
                                             vn.state.show_full = true;
                                             entry.save()
                                          } },
                                "Done"),
                        ])),
                    m("div", { class: "card-footer-item is-size-7" },
                        m("button", { class: btn_class,
                                      onclick: function() { entry.ask_del() } },
                            "Delete")),
                ]));
        }

        return m("div", { class: "card", id: id }, card)
    }
};

function search(stxt, cb) {
    m.request({
        method: "POST",
        url: "/journal/search/entries",
        body: { search: stxt },
    }).then(function(data) {
        self.changed = false;
        if (cb) cb(data);
    });
}

class SearchColumn {
    do_search(vn, srchtxt) {
        search(srchtxt, function(entries) {
            vn.state.entries = entries;
            if (entries)
                entries.map(function(e) {
                    load_cache(e.id, e);
                });
        });
    }

    view(vn) {
        let self = this;

        if (!vn.state.entries) vn.state.entries = [];
        if (!vn.state.input_txt && !vn.state.last_search_req) {
            vn.state.last_search_req = true;
            m.request({
                method: "GET",
                url: "/journal/search/last",
            }).then(function(data) {
                vn.state.input_txt = data.search;
                self.do_search(vn, data.search);
            });
        }

        let cards = [];
        cards.push(
            m("div",
                m("input", { style: "width: 100%; margin-bottom: 0.75rem;",
                             type: "text",
                             id: "search",
                             value: vn.state.input_txt,
                             onchange: function(ev) {
                    ev.preventDefault();
                    let srchtxt = ev.target.value.toLowerCase();
                    vn.state.input_txt = srchtxt;
                    self.do_search(vn, srchtxt);
                } })));

        vn.state.entries.map(function(e) {
            cards.push(
                m("div", { class: "is-size-7",
                           style: "margin-bottom: 0.75em" },
                    m(EntryView, { entry_id: e.id })));
        });

        return m("div", { class: "column" }, cards);

    }
}

class ModalView {
    view(vn) {
        if (modal) {
            return m("div", { class: "modal is-active" }, [
                m("div", { class: "modal-background" }),
                m("div", { class: "modal-content" }, [
                    m("div", { class: "box content" }, [
                        m("div", modal.text),
                        m("div", { class: "columns" }, [
                            m("div", { class: "column" },
                                m("button", { class: "button is-fullwidth is-danger",
                                              onclick: function() { modal.cb(); modal = null; } }, "Yes")),
                            m("div", { class: "column" },
                                m("button", { class: "button is-fullwidth is-success",
                                              onclick: function() { modal = null; } }, "Cancel")),
                        ])
                    ])
                ])
            ]);
        } else {
            return m("div");
        }
    }
};

//var search_state = [{}, {}];

//function do_search(idx, str) {
//}
//
//var SearchColumnView = {
//    view: function(vn) {
//        console.log("RED RE:", recent_entries);
//        let results = search_state[vn.attrs.srcidx].results;
//        let res_node;
//        if (results) {
////            res_node = m("div", {}, [
////                search_state[vn.attrs.srcidx].
////            ]);
////                recent_entries.filter(e => !e.deleted).map(function(e) {
////                    return m("div", { class: "is-size-7", style: "margin-bottom: 0.75em" },
////                        m(EntryView, { entry_id: e.id, center_on_edit: true }))
////                }));
//        } else {
//            res_node = m("div");
//        }
//
//        return m("div", {}, [
//            m("div", { class: "columns" }, [
//                m("div", { class: "column" },
//                    m("input", { class: "input is-small", type: "text", onchange: function(e) {
//                        do_search(vn.attrs.srcidx, e.target.value)
//                    } })),
//            ]),
//            res_node,
//        ]);
//    },
//};

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

class NavbarView {
    view(vn) {
        let active = "";
        if (vn.state.menu_active) {
            active = " is-active";
        }

        return m("nav", { class: "navbar is-info",
                          role: "navigation",
                          ["aria-label"]: "main navigation" }, [
            m("div", { class: "navbar-brand" },
                m("a", { class: "navbar-burger burger" + active,
                         role: "button",
                         onclick: function() {
                            vn.state.menu_active = !vn.state.menu_active;
                         },
                         ["aria-label"]: "menu",
                         ["aria-expanded"]: "false",
                         ["data-target"]: "navbarBasicExample" }, [
                    m("span", { ["aria-hidden"]: "true" }),
                    m("span", { ["aria-hidden"]: "true" }),
                    m("span", { ["aria-hidden"]: "true" })
                ])),
            m("div", { id: "navbarBasicExample", class: "navbar-menu" + active }, [
                m("div", { class: "navbar-start" }, [
                    m("div", { class: "navbar-item" },
                        m("div", { class: "buttons" }, [
                            m("a", { class: "button is-primary",
                                     onclick: function(ev) { new_entry(); } },
                                "New"),
                            m("a", { class: "button is-light",
                                     onclick: function(ev) { open_diary(); } },
                                "Diary"),
                            m("a", { class: "button is-link",
                                     onclick: function(ev) {
                                        document.getElementById("search").scrollIntoView();
                                     } },
                                "Search"),
                        ]))
                ]),
                m("div", { class: "navbar-end" }, [
                ]),
            ]),
        ])
    }
}

var TopLevel = {
    oninit: function(vn) {
        get_recent_entries();
    },
    view: function(vn) {
        if (vn.attrs.id != null) {
            edit_entry_id = vn.attrs.id;
        }

        return m("div", { id: "top" }, [
            m(NavbarView),
            m("section", { class: "section", style: "padding-top: 0.5rem" }, [
                m(ModalView),
                m("div", { class: "columns is-3" }, [
                    m("div", { class: "column" },  [
                        m(EntryView, { is_top_editor: true, entry_id: edit_entry_id }),
                        m("hr"),
                        m(RecentEntries),
                    ]),
                    m(SearchColumn),
                ]),
            ])
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

console.log("GO;", document.body);

m.route(document.body, '/main', {
    '/main': TopLevel,
    '/entry/:id': TopLevel,
});
