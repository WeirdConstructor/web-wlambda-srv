"use strict";


// This script is released to the public domain and may be used, modified and
// distributed without restrictions. Attribution not necessary but appreciated.
// Source: http://weeknumber.net/how-to/javascript 

// Returns the ISO week of the date.
Date.prototype.getWeek = function() {
  var date = new Date(this.getTime());
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  // January 4 is always in week 1.
  var week1 = new Date(date.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

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
var current_entry_id = null;
var enable_entry_edit = false;
var new_entry_tags = null;
var modal = null;

function http_err(e) {
    modal = {};
    modal.cb = function() {};
    modal.text = "HTTP ERROR: " + e.message;
}

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

function get_day_fmt(d) {
    return (
                padl("" + (d.getYear() + 1900),"0", 4)
        + "-" + padl("" + (d.getMonth() + 1),  "0", 2)
        + "-" + padl("" + (d.getDate()),       "0", 2));
}

function get_day(offset) {
    let d = new Date();
    if ((typeof offset) == "object")
        d = offset;
    else if (offset != null) {
        d.setDate(d.getDate() + offset);
    }
    return get_day_fmt(d);
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

function goto_entry_and_edit(id) {
    goto_entry(id);
    enable_entry_edit = true;
}

function goto_entry(id) {
    m.route.set("/entry/:id", { id: id });
    let te = document.getElementById("top");
    if (te) te.scrollIntoView();
}

function get_recent_entries() {
    m.request({ method: "GET", url: "/journal/search/entries/recent"
    }).then(function(data) {
        if (data == null) { data = []; }
        recent_entries = data;

        console.log("RECENT ENTREIS");
        if (recent_entries.length > 0 && current_entry_id == null) {
            goto_entry(get_recent_valid_entry_id());
        }
    }).catch(http_err);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}


function open_diary(offset) {
    search(get_day(offset), function(ents) {
        if (ents && ents.length > 0) {
            ents.map(function(e) { load_cache(e.id, e) });
            goto_entry(ents[0].id);
        } else {
            new_entry(function(entry_id) {
                new_entry_tags = [entry_id, get_day(offset) + ", timelog, diary"];
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
        get_recent_entries();
        goto_entry_and_edit(data[0].new_entry_id);
        if (cb) cb(data[0].new_entry_id);
    }).catch(http_err);
}

var entries = {};
function load_cache(id, e) {
    id = "" + id;
    if (e) {
        entries[id] = new Entry(id, e);
    } else {
        entries[id] = new Entry(id);
    }
}

function get_entry_by_id(id) {
    if (!id) return null;
    id = "" + id;

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
        //d// console.log("CONSTRUCT", [id, entry]);
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
    }

    load_entry_id(id) {
        let self = this;
        self.entry = { body: "loading...", tags: "loading..." };
        if (self.entry_id == id) return;

        m.request({ method: "GET", url: "/journal/data/entries/" + id })
         .then(function(data) {
            self.set_entry(data);
         }).catch(http_err);
    }

    uncommitted_changes() {
        return this.changed;
    }

    ask_del_attachment(id, file) {
        let self = this;
        modal = {
            text: "Really delete attachment [" + id + "]: " + file + "?",
            cb: function () { self.del_attachment(id); },
        };
    }

    ask_del() {
        let self = this;
        modal = {
            text: "Really delete?",
            cb: function () { self.del(); },
        };
    }

    del_attachment(id) {
        let self = this;
        m.request({
            method: "GET",
            url: "/journal/deleteupload/" + id,
        }).then(function() {
            self.refresh_attachments();
        }).catch(http_err);
    }

    del() {
        let self = this;
        this.entry.deleted = 1;
        this.save(function(ok) {
            if (!ok) return;

            if (self.entry.id == current_entry_id) {
                current_entry_id = null;
                m.route.set("/main");
                enable_entry_edit = false;
            }
            get_recent_entries();
        });
    }

    is_edited_entry() {
        if (!this.entry) return false;
        return this.entry.id == current_entry_id;
    }

    set_checkbox(idx, text, checked) {
        let ts = this.get_timestamp();
        let i = 0;
        this.entry.body = this.entry.body.replace(checkbox_re, function(l, txt) {
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
        let self = this;

        self.make_sure_newline_at_end();
        let lines = self.entry.body.split(/\r?\n/);
        let out = [];
        let is_todo_block = null;
        let last_padding = "";
        let pushed = false;

        lines.map(function(l) {
            if (pushed) { out.push(l); return; }
            let m = l.match(/^(\s*)- \[[ x]\] /);
            if (m) {
                is_todo_block = true;
                last_padding = m[1];
            } else {
                if (is_todo_block) {
                    out.push(last_padding + "- [ ] ");
                    pushed = true;
                }
            }
            out.push(l);
        });

        if (!pushed)
            out.push("- [ ] ");

        self.entry.body = out.join("\n");
        self.changed = true;
    }

    save(done_cb) {
        let self = this;

        m.request({
            method: "POST",
            url: "/journal/data/entries/" + this.entry.id,
            body: this.entry
        }).then(function(data) {
            if (data && data[2] && data[2].mtime != null) {
                self.entry.mtime = data[2].mtime;
                console.log("SAVED:", self.entry);
                self.changed = false;
                if (done_cb) done_cb(true);
            }
        }).catch(function(e) {
            http_err(e);
            if (done_cb) done_cb(false);
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

    displayed_body() {
        return this.entry.body.replace(/.*#jrnltbl#((?:.|\r?\n)*)#jrnltbl_end#/, "");
    }

    full_body()  {
        let v = this.displayed_body().split(/\n/);
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

    refresh_attachments() {
        let self = this;

        if (!self.getting_attachments) {
            self.getting_attachments = true;

            m.request({
                method: "GET",
                url: "/journal/attachments/" + self.id(),
            }).then(function(at) {
                if (at == null) { at = []; }
                self.entry.attachments = at;
                console.log("At " + self.entry.id, at);
                self.getting_attachments = false;
            }).catch(function() {
                self.getting_attachments = false;
            });
        }
    }

    has_attachments() {
        let self = this;

        if (self.entry.attachments == null) {
            self.refresh_attachments();
            return false;
        } else if (self.entry.attachments) {
            return true;
        }
    }

    get_attachments() {
        if (!this.entry.attachments) return [];
        else return this.entry.attachments;
    }

    short_body() {
        let v = this.displayed_body().split(/\n/);
        let out = [];
        for (let i = 0; i < 10; i++) {
            out.push(v[i]);
        }
        return [out.join("\n"), v.length > 10];
    }

    parse_table(tbl_def) {
        let table_struct = {
            cols: [],
            rows: [],
            labels: [],
            colors: {},
            data: null,
        };
        let lines = tbl_def[1].split(/\s*\n\s*/);
        lines.map(function(l) {
            let def = l.split(/\s*;\s*/);
            if (def[0] == "rows") {
                def.shift();
                if (def[0] == "daytimes") {
                    let t = [];
                    for (let i = 0; i < 18; i++) {
                        t.push((i + 5) + ":00");
                        t.push((i + 5) + ":30");
                    }
                    table_struct.rows_special = def[0];
                    table_struct.rows = t;
                } else {
                    table_struct.rows = def;
                }
            } else if (def[0] == "cols") {
                def.shift();
                table_struct.cols = def;

                if (!table_struct.data) {
                    table_struct.data = table_struct.cols.map(function() {
                        return table_struct.rows.map(function() { return null });
                    });
                }
            } else if (def[0] == "def") {
                table_struct.labels.push([def[1], def[2], ""]);
                table_struct.colors[def[1]] = def[2];
            } else if (def[0] == "@") {
                let col = def[1] * 1;
                let row = def[2] * 1;
                let lbl = def[3];
                let txt = def[4];
                table_struct.data[col][row] = [lbl, txt, table_struct.colors[lbl]];
            }
        });

        return table_struct;
    }

    render_table_to(vn, table_struct, html_rows) {
        let self = this;
        let lblbtns = [];

        if (vn.state.lbl_selected) {
            let l = vn.state.lbl_selected;
            lblbtns.push(
                m("button", { class: "button is-small",
                              style: "background-color: " + l[1],
                              onclick: function() { vn.state.lbl_selected = null } },
                   "[" + l[0] + "]"));
        } else {
            lblbtns.push(m("button", { class: "button is-small" }, "[ ]"));
        }

        lblbtns.push(
            m("button", { class: "button is-small",
                          onclick: function() {
                                vn.state.lbl_selected = ["+", "+", null] } },
               "[+]"));
        lblbtns.push(
            m("button", { class: "button is-small",
                          onclick: function() {
                                vn.state.lbl_selected = ["-", "-", null] } },
               "[-]"));
        lblbtns.push(
            m("button", { class: "button is-small",
                          onclick: function() {
                                vn.state.lbl_selected = ["X", null, null] } },
               "[X]"));
        lblbtns.push(
            m("button", { class: "button is-small",
                          onclick: function() {
                                vn.state.lbl_selected = ["P", "pick", null] } },
               "[P]"));
        lblbtns.push(
            m("button", { class: "button is-small",
                          onclick: function() {
                                vn.state.lbl_selected = ["P", "pickup", null] } },
               "[R]"));

        table_struct.labels.map(function(l) {
            let lbl = l[0];
            let clr = l[1];
            lblbtns.push(
                m("button", { class: "button is-small",
                              style: "background-color: " + clr,
                              onclick: function() { vn.state.lbl_selected = [lbl, clr, ""] } },
                   lbl));
        });
        html_rows.push(
            m("div", { class: "buttons has-addons is-small is-size-7" }, lblbtns)
        );
        if (vn.state.lbl_selected && vn.state.lbl_selected[2] != null) {
            html_rows.push(
                m("input", {
                    class: "input",
                    type: "text",
                    value: vn.state.lbl_selected[2],
                    oninput: function(e) {
                        vn.state.lbl_selected[2] = (e.target.value);
                    },
                }));
        } else {
            html_rows.push(
                m("input", { class: "input", type: "text", disabled: "disabled" }));
        }

        let tbl_rows = table_struct.rows.map(function(lbl, row_idx) {
            let r = table_struct.cols.map(function(lbl, col_idx) {
                let cell = table_struct.data[col_idx][row_idx];
                let content = [];
                if (vn.state.lbl_selected) {
                    content.push(
                        m("a", { class: "button is-small",
                                 href: "#!",
                                 onclick: function(e) {
                                   e.preventDefault();
                                   if (vn.state.lbl_selected[1] == null) {
                                       table_struct.data[col_idx][row_idx] = null;
                                   } else if (vn.state.lbl_selected[1] == "+") {
                                       let last = null;
                                       for (let i = row_idx; i < table_struct.data[col_idx].length; i++) {
                                          let next_last = table_struct.data[col_idx][i];
                                          table_struct.data[col_idx][i] = last;
                                          last = next_last;
                                       }
                                   } else if (vn.state.lbl_selected[1] == "-") {
                                       for (let i = row_idx; i < table_struct.data[col_idx].length; i++) {
                                          let next = table_struct.data[col_idx][i + 1];
                                          table_struct.data[col_idx][i] = next;
                                       }
                                   } else if (vn.state.lbl_selected[1] == "pick") {
                                       vn.state.lbl_selected = [cell[0], cell[2], cell[1]];
                                   } else if (vn.state.lbl_selected[1] == "pickup") {
                                       vn.state.lbl_selected = [cell[0], cell[2], cell[1], "pickup"];
                                       table_struct.data[col_idx][row_idx] = null;
                                   } else {
                                       let sel = vn.state.lbl_selected;
                                       if (vn.state.lbl_selected[3] == "pickup") {
                                           if (cell == null) {
                                               vn.state.lbl_selected = ["P", "pickup", null];
                                           } else {
                                               vn.state.lbl_selected = [cell[0], cell[2], cell[1], "pickup"];
                                           }
                                       }
                                       table_struct.data[col_idx][row_idx] =
                                           [sel[0], sel[2], sel[1]];
                                   }
                                   self.set_table(table_struct);
                                 } }, "*"));
                }
                if (cell) {
                    content.push(m("span", cell[1]));
                }
                if (cell)
                    return m("td", { style: "padding: 0.1rem; background-color: " + cell[2], class: "is-clipped" }, content);
                else
                    return m("td", { style: "padding: 0.1rem; ", class: "is-clipped" }, content);
            });
            r.unshift(m("th", { style: "padding: 0.1rem" }, lbl));
            return m("tr", r);
        });

        let col_heads =
            table_struct.cols.map(function(lbl) { return m("th", lbl); });
        col_heads.unshift(m("th"));
        tbl_rows.unshift(m("tr", col_heads));

        html_rows.push(m("div", { class: "table-container" },
            m("table", { class: "table is-striped is-narrow is-fullwidth is-bordered is-size-7",
                         style: "table-layout: fixed" }, tbl_rows)));
    }

    serialize_table(table_struct) {
        let rows = [];
        rows.push("#jrnltbl#");
        if (table_struct.rows_special) {
            rows.push("rows;" + table_struct.rows_special);
        } else {
            rows.push("rows;" + table_struct.rows.join(";"));
        }
        rows.push("cols;" + table_struct.cols.join(";"));
        table_struct.labels.map(function(l) {
            rows.push("def;" + l[0] + ";" + l[1]);
        });
        for (let c = 0; c < table_struct.cols.length; c++) {
            for (let r = 0; r < table_struct.rows.length; r++) {
                let cell = table_struct.data[c][r];
                if (cell) {
                    rows.push("@;" + c + ";" + r + ";" + cell[0] + ";" + cell[1]);
                }
            }
        }
        rows.push("#jrnltbl_end#");
        return rows.map(function(s) { return "    " + s }).join("\n");
    }

    set_table(table_struct) {
        let ser = this.serialize_table(table_struct);
        this.entry.body =
            this.entry.body.replace(/.*#jrnltbl#((?:.|\r?\n)*)#jrnltbl_end#/, ser);
        this.changed = true;
    }

    rendered_body(show_full, vn) {
        let body;
        let cont_link = false;
        let table;
        if (show_full) {
            let tbl = this.entry.body.match(/#jrnltbl#((?:.|\r?\n)*)#jrnltbl_end#/);
            if (tbl) {
                table = this.parse_table(tbl);
                console.log("TABLE:", table);
            }

            body = this.full_body();
        } else {
            let r = this.short_body();
            body = r[0];
            cont_link = r[1];
        }

        let html_rows = [
            m.trust(marked(body, markedOptions)),
            (cont_link
                ? m("a", { onclick: function(e) {
                        e.preventDefault();
                        vn.state.show_full = true;
                    } }, "...")
                : m("span")),
        ];

        if (table) {
            this.render_table_to(vn, table, html_rows);
        }

        return html_rows;
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
            card.push(m("div", { class: "card-content",
                                 entry_id: vn.attrs.entry_id,
                                 style: "padding: 0.5rem" },
                m("textarea",
                  { class: "textarea is-size-7 is-fullwidth is-family-monospace "
                           + tint_class,
//                    onkeypress: function(e) {
//                        console.log("KEY:", e);
//                        e.preventDefault();
//                        e.redraw = false;
//document.addEventListener("keypress", function(e) {
//    if (e.getModifierState("Control")) {
//        switch (e.key) {
//                    },
                    style: "min-height: 300px",
                    oninput: function(e) {
//                        console.log("ONINPUT");
                        entry.set_body(e.target.value);
                    } },
                  entry.body())));

        } else {
            if (entry.body()) {
                before_calling_marked_with_entry(entry);

                let body_array = entry.rendered_body(show_full, vn);

                let content = m("div", { class: "card-content",
                                         entry_id: vn.attrs.entry_id,
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
            if (entry.has_attachments()) {
                card.push(m("div", { class: "card-content content", style: "padding: 0" }, m("ul", 
                    entry.get_attachments().map(function(at) {
                        let a = [
                            m("a", {
                            href: "/journal/files/attachments/"
                                  + at.local_filename },
                            at.local_thumb_filename
                            ? (m("img", { src: "/journal/files/attachments/" + at.local_thumb_filename }))
                            : ("[" + at.id + "] - " + at.name)),
                        ];
                        if (vn.state.show_upload) {
                            a.unshift(
                                m("button", { class: btn_class,
                                              onclick: function() { entry.ask_del_attachment(at.id, at.name) } },
                                    "Delete " + at.id));
                        }
                        return m("li", a);
                    })
                )));
            }

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

            let actions = [
                m("button", { class: btn_class,
                              onclick: function() { entry.add_log() } },
                    "Log"),
                m("button", { class: btn_class,
                              onclick: function() { entry.add_todo() } },
                    "Todo"),
                m("button", { class: "button is-outlined is-link" ,
                              onclick: function() { vn.state.show_ent_link_copy = !vn.state.show_ent_link_copy; } },
                    "Ent"),
                m("button", { class: "button is-outlined is-link" ,
                              onclick: function() { vn.state.show_upload = !vn.state.show_upload; } },
                    "Upl"),
            ];
            if (vn.state.show_ent_link_copy) {
                actions.push(
                    m(ClipboardText,
                        { text: "<ent:" + vn.attrs.entry_id + ">",
                          done: function() {
                            vn.state.show_ent_link_copy = null; } }));
            }
            if (vn.state.show_upload) {
                let upl = [];
                if (vn.state.upload_perc != null) {
                    upl.push(m("progress", { class: "progress is-primary", value: vn.state.upload_perc, max: "100" },
                        "" + vn.state.upload_perc + "%"));
                } else {
                    upl.push(
                        m("div", { class: "control" },
                        m("div", { class: "file" },
                            m("label", { class: "file-label" }, [
                                m("input", { class: "file-input", type: "file", onchange: function(e) {
                                    e.preventDefault();
                                    let fi = e.target.files;
                                    vn.state.upload_perc = 0;
                                    do_upload(vn.attrs.entry_id, fi[0], function() {
                                        vn.state.show_upload = false;
                                        entry.refresh_attachments();
                                        vn.state.upload_perc = null;
                                    }, function(p) {
                                        vn.state.upload_perc = p;
                                    });
                                } }),
                                m("span", { class: "file-cta" }, [
                                    m("span", { class: "file-icon" },
                                        m("i", { class: "fas fa-upload" })),
                                    m("span", { class: "file-label" },
                                        "Choose a file..."),
                                ]),
                            ])
                        )));
                    upl.push(
                        m("div", { class: "control" },
                        m("input", { class: "input", style: "width: 5rem", type: "text",
                                     placeholder: "paste",
                                     onpaste: function(e) {
                            e.preventDefault();
                            let fi = e.clipboardData.files;
                            vn.state.upload_perc = 0;
                            do_upload(vn.attrs.entry_id, fi[0], function() {
                                vn.state.show_upload = false;
                                entry.refresh_attachments();
                                vn.state.upload_perc = null;
                            }, function(p) {
                                vn.state.upload_perc = p;
                            });
                        } })));
                }
                card.push(m("div", { class: "card-content", style: "padding: 0" },
                    m("div", { class: "field has-addons", }, upl)));
            }

            card.push(
                m("footer", { class: "is-hidden-print card-footer" }, [
                    m("div", { class: "card-footer-item is-size-7" },
                        m("div", { class: "buttons has-addons is-centered" }, actions)),
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

//let slice_size = 1000 * 1024;
let slice_size = 256 * 1024;

function do_upload(entry_id, file, cb, pcb) {
    let name = file.name;
    let type = file.type;
    let r = new FileReader();

    let meta = {
        entry_id: entry_id,
        name: name,
        type: type,
    };

    upload_slice(r, file, meta, 0, cb, pcb);
}

function upload_slice(r, file, meta, offset, cb, pcb) {
    let next_offset = offset + slice_size + 1;
    let blob = file.slice(offset, next_offset);

    r.onloadend = function(e) {
        if (e.target.readyState != FileReader.DONE) {
            return;
        }

        meta.data = e.target.result;

        let url_part = "fileupload/" + meta.entry_id;
        if (offset > 0) { url_part = "sliceupload/" + meta.at_id }

        m.request({
            method: "POST",
            url: "/journal/" + url_part,
            body: meta,
        }).then(function(data) {
            if (offset <= 0) {
                meta.at_id = data[0];
            }
            if (next_offset < file.size) {
                upload_slice(r, file, meta, next_offset, cb, pcb);
                let percent = Math.floor((offset / file.size) * 100);
                if (pcb) pcb(percent);
            } else {
                if (pcb) pcb(100);
                m.request({
                    method: "GET",
                    url: "/journal/trigger_attachment_thumb/" + meta.at_id,
                    body: meta,
                }).then(function() {
                    if (cb) cb();
                });
            }
        }).catch(http_err);
    };

    r.readAsDataURL(blob);
}

function search(stxt, cb) {
    m.request({
        method: "POST",
        url: "/journal/search/entries",
        body: { search: stxt },
    }).then(function(data) {
        self.changed = false;
        if (data != null && !(data instanceof Array)) {
            http_err(data);
            return;
        }
        if (cb) cb(data);
    }).catch(http_err);
}

function get_week_fmt(offs) {
    if (offs == null) offs = 0;
    let week_date = new Date();
    if ((typeof offs) == "object") {
        week_date = offs;
        offs = 0;
    }

    week_date.setDate(week_date.getDate() + (offs * 7));
    return (
        padl("" + (week_date.getYear() + 1900), "0", 4)
        + "-kw"   + padl("" + week_date.getWeek(), "0", 2)
    );
}

class SearchColumn {
    do_search(vn, srchtxt) {
        search(srchtxt, function(ents) {
            if (ents) {
                vn.state.ents = ents;
                ents.map(function(e) { load_cache(e.id, e); });
            } else {
                vn.state.ents = [];
            }
        });
    }

    get_preset_search_text(vn, name) {
        if (name == "" || name == null) return null;
        let p = this.presets(vn);
        let r = p.filter(function(p) { return p.name == name; });
        if (r) return r[0].search();
        else   return null;
    }

    presets(vn) {
        return [
            { name: "",             search: function() { return "" } },
            { name: "work today",   search: function() { return "m_new " + get_day() + " | arbeit" } },
            { name: "today",        search: function() { return get_day() } },
            { name: "today week",   search: function() {
                let d = new Date();
                return (
                    "t_old "
                    + get_week_fmt()
                    + " | " + get_day());
            } },
            { name: "complete week",search: function() {
                let d = new Date();
                d.setDate(d.getDate() - d.getDay());
                d.setDate(d.getDate() + 1);
                let week_dates = "";
                for (let i = 0; i < 7; i++) {
                    if (week_dates != "") week_dates += " | ";
                    week_dates += get_day_fmt(d);
                    d.setDate(d.getDate() + 1);
                }
                week_dates += " | " + get_week_fmt();
                return "t_new " + week_dates + " | weekly review";
            } },
            { name: "complete last week",search: function() {
                let d = new Date();
                d.setDate(d.getDate() - (d.getDay() + 7));
                d.setDate(d.getDate() + 1);
                let week_dates = "";
                for (let i = 0; i < 7; i++) {
                    if (week_dates != "") week_dates += " | ";
                    week_dates += get_day_fmt(d);
                    d.setDate(d.getDate() + 1);
                }
                week_dates += " | " + get_week_fmt(-1);
                return "t_new " + week_dates + " | weekly review";
            } },
            { name: "week",         search: function() {
                let d = new Date();
                return get_week_fmt();
            } },
            { name: "month",        search: function() {
                let d = new Date();
                d = new Date(d.getYear() + 1900, d.getMonth(), 1);
                let month_str = "";
                let weeks = {};
                let week_ary = [];
                for (let i = 0; i < 31; i++) {
                    if (month_str != "") month_str += " | ";
                    month_str += get_day_fmt(d);
                    if (!weeks[d.getWeek()]) {
                        week_ary.push(new Date(d));
                        weeks[d.getWeek()] = true;
                    }
                    d.setDate(d.getDate() + 1);
                }
                month_str += " | " + week_ary.map(function(d) {
                    return (     padl("" + (d.getYear() + 1900), "0", 4)
                    + "-kw" + padl("" + (d.getWeek()), "0", 2));
                }).join(" | ");
                return "t_new " + month_str;
            } },
        ];
    }

    view(vn) {
        let self = this;

        if (!vn.state.ents) vn.state.ents = [];
        if (!vn.state.input_txt && !vn.state.last_search_req) {
            vn.state.last_search_req = true;
            m.request({
                method: "GET",
                url: "/journal/search/last",
            }).then(function(data) {
                vn.state.input_txt = data.search;
                self.do_search(vn, data.search);
            }).catch(http_err);
        }

        let cards = [];
        cards.push(
            m("div", { class: "is-hidden-touch" },
            m("div", { class: "field has-addons", style: "margin-top: 0rem" }, [
                m("p", { class: "control" },
                    m("span", { class: "select",
                               onchange: function(e) {
                                    let srchtxt =
                                        self.get_preset_search_text(
                                            vn, e.target.value);
                                    if (srchtxt != null) {
                                        vn.state.input_txt = srchtxt;
                                        self.do_search(vn, srchtxt);
                                        e.target.value = "";
                                    }
                               } },
                        m("select", this.presets(vn).map(function(p) {
                            return m("option", { value: p.name }, p.name);
                        })))),
                m("p", { class: "control is-expanded" },
                    m("input", { style: "width: 100%; margin-bottom: 0.75rem;",
                                 class: "input",
                                 type: "text",
                                 value: vn.state.input_txt,
                                 onchange: function(ev) {
                        ev.preventDefault();
                        let srchtxt = ev.target.value.toLowerCase();
                        vn.state.input_txt = srchtxt;
                        self.do_search(vn, srchtxt);
                    } })),
                m("p", { class: "control" },
                    m("button", { class: "button", onclick: function() { vn.state.input_txt = ""; } }, "Clear")),
            ])));
        cards.push(
            m("div", { class: "is-hidden-desktop" },
            m("div", { class: "field", style: "margin-top: 0rem" }, [
                m("p", { class: "control" },
                    m("span", { class: "select",
                               onchange: function(e) {
                                    let srchtxt =
                                        self.get_preset_search_text(
                                            vn, e.target.value);
                                    if (srchtxt != null) {
                                        vn.state.input_txt = srchtxt;
                                        self.do_search(vn, srchtxt);
                                        e.target.value = "";
                                    }
                               } },
                        m("select", this.presets(vn).map(function(p) {
                            return m("option", { value: p.name }, p.name);
                        })))),
                m("p", { class: "control is-expanded" },
                    m("input", { style: "width: 100%; margin-bottom: 0.75rem;",
                                 class: "input",
                                 type: "text",
                                 value: vn.state.input_txt,
                                 onchange: function(ev) {
                        ev.preventDefault();
                        let srchtxt = ev.target.value.toLowerCase();
                        vn.state.input_txt = srchtxt;
                        self.do_search(vn, srchtxt);
                    } })),
                m("p", { class: "control" },
                    m("button", { class: "button", onclick: function() { vn.state.input_txt = ""; } }, "Clear")),
            ])));

        vn.state.ents.map(function(e) {
            cards.push(
                m("div", { class: "is-size-7",
                           style: "margin-bottom: 0.75em" },
                    m(EntryView, { entry_id: e.id })));
        });

        return m("div", { id: "search", class: "is-hidden-print column" }, cards);

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
    view: function(vn) {
        if (!recent_entries)
            get_recent_entries();
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

class ClipboardText {
    view(vn) {
        return m("div", [
            m("input", { type: "text",
                         style: "width: 3rem;",
                         id: "clip_text",
                         class: "input",
                         value: vn.attrs.text }),
            m("button", { type: "text", class: "is-primary button",
                          onclick: function(e) {
                            let n = e.target.parentNode.children[0];
                            n.select();
                            n.setSelectionRange(0, 99999);
                            document.execCommand("copy");
                            vn.attrs.done();
                          } }, "Copy"),
        ]);
    }
};

function date_for_week(year, week) {
    let d = new Date(year, 0, 1);
    d.setDate(d.getDate() + (week - 1) * 7);
    d.setDate(d.getDate() - (d.getDay() - 1));
    return d;
}

let WEEK_DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

class WeekView {
    view(vn) {
        let kwmatch = vn.attrs.week.match(/^(\d+)-kw(\d+)$/);
        if (!kwmatch) return m("span", "INVALID WEEK: " + vn.attrs.week);

        let week_offs = vn.attrs.offs;
        if (week_offs == null) week_offs = 0;

        let today_fmt = get_day_fmt(new Date);
        let this_week_fmt = get_week_fmt(new Date);

        let d = date_for_week(
            parseInt(kwmatch[1]),
            parseInt(kwmatch[2]) + week_offs);
        let week_fmt = get_week_fmt(d);

        let search_str = week_fmt;
        let col_heads = [];
        for (let i = 0; i < 7; i++) {
            let x = new Date(d.getYear() + 1900, d.getMonth(), d.getDate());
            x.setDate(x.getDate() + i);
            let clr_style = "";
            if (today_fmt == get_day_fmt(x))
                clr_style = "background-color: #ffaaaa";

            col_heads.push(m("th",
                { class: "is-clipped", style: clr_style },
                WEEK_DAYS[x.getDay()] + " "
                + get_day_fmt(x).replace("" + (x.getYear() + 1900) + "-", "")));
            search_str += " | " + get_day_fmt(x);
        }
        let tbl_rows = [];
        col_heads.unshift(m("th", { style: "background-color: #eef" }, week_fmt));
        tbl_rows.push(m("tr", col_heads));

        if (!vn.state.search_started || vn.state.searched != search_str) {
            console.log("SEARCH", search_str);
            vn.state.search_started = true;
            vn.state.searched = search_str;
            search(search_str, function(resp) {
                console.log("entries", resp);
                vn.state.entries = resp;
            });
        }

        if (vn.state.entries) {
            let ents = [];
            let kw = week_fmt;
            let kwents = [];
            vn.state.entries.map(function(e) {
                if (e.tags.indexOf(kw) >= 0) {
                    let eid = e.id;
                    kwents.push(m("a",
                        { style: "font-weight: bold",
                          href: "#!/entry/" + e.id,
                          alt: "entry " + e.id },
                        "[" + e.tags + "]"));
                }
            });
            ents.push(m("td", { class: "is-clipped", style: "background-color: #eef" }, kwents));


            for (let i = 0; i < 7; i++) {
                let x = new Date(d.getYear() + 1900, d.getMonth(), d.getDate());
                x.setDate(x.getDate() + i);
                let fd = get_day_fmt(x);
                let entries_for_this_day = [];
                vn.state.entries.map(function(e) {
                    if (e.tags.indexOf(fd) >= 0) {
                        let eid = e.id;
                        entries_for_this_day.push(m("a",
                            { style: "font-weight: bold",
                              href: "#!/entry/" + e.id,
                              alt: "entry " + e.id },
                            "[" + e.tags.replace("" + (x.getYear() + 1900) + "-", "") + "] "));
                    }
                });

                let clr_style = "";
                if (today_fmt == fd)
                    clr_style = "; background-color: #ffaaaa";

                if (entries_for_this_day.length <= 0) {
                    entries_for_this_day.push(
                        m("a", { class: "button is-small is-success is-outlined is-light",
                                 onclick: function(ev) { open_diary(x); } },
                            "+"));
                }
                ents.push(m("td", { class: "is-clipped", style: "padding: 0.1rem" + clr_style },
                            entries_for_this_day));
            }
            tbl_rows.push(m("tr", ents));
        }

        let tbl_clr_style = "";
        if (this_week_fmt == week_fmt)
            tbl_clr_style = "; background-color: #fff";
        else
            tbl_clr_style = "; background-color: #eee";

        return (m("div", { class: "table-container" },
            m("table", { class: "table is-striped is-narrow is-fullwidth is-bordered is-size-7",
                         style: "min-width: 300px; table-layout: fixed" + tbl_clr_style },
                         tbl_rows)));
    }
}

class NavbarView {
    view(vn) {
        let active = "";
        if (vn.state.menu_active) {
            active = " is-active";
        }

        return m("nav", { class: "is-hidden-print navbar is-info",
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
                            m("a", { class: "button is-light",
                                     onclick: function(ev) { open_diary(1); } },
                                "Diary+1"),
                            m("a", { class: "button is-light",
                                     href: "#!/week/" + padl("" + get_week_fmt(), "0", 2) },
                                "Week"),
                            m("a", { class: "button is-light",
                                     href: "#!/week/" + padl("" + get_week_fmt(-1), "0", 2) },
                                "Last Week"),
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
    view: function(vn) {
        if (vn.attrs.id != null) {
            current_entry_id = vn.attrs.id;

        } else if (vn.attrs.week != null) {
            return m("div", { id: "top" }, [
                m(NavbarView),
                m("section", { class: "section", style: "padding-top: 0.5rem" }, [
                    m(WeekView, { week: vn.attrs.week, offs: -1 }),
                    m(WeekView, { week: vn.attrs.week, }),
                    m(WeekView, { week: vn.attrs.week, offs: +1 }),
                ])
            ]);
        }

        return m("div", { id: "top" }, [
            m(NavbarView),
            m("section", { class: "section", style: "padding-top: 0.5rem" }, [
                m(ModalView),
                m("div", { class: "columns is-3" }, [
                    m("div", { class: "column" },  [
                        m(EntryView, { is_top_editor: true, entry_id: current_entry_id }),
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
        switch (e.key) {
            case "Enter":
                e.redraw = false;
                let el = document.activeElement;
                if (!el) return;
                el = el.parentElement;
                if (!el) return;
                let at = el.attributes.getNamedItem("entry_id");
                if (!at) return;
                let eid = at.nodeValue;
                if (eid) {
                    let ent = get_entry_by_id(eid);
                    if (ent) ent.save(function(ok) {
                        // FIXME: Some weird workaround?! textarea is empty
                        //        after save() finishes.
                        //        DOM-Diffing is probably fucked up.
                        m.redraw();
                        setTimeout(function() { m.redraw() }, 50);
                    });
                    e.redraw = false;
                    e.preventDefault();
                }
                break;
        }
    }
});

m.route(document.body, '/main', {
    '/main':        TopLevel,
    '/week/:week':  TopLevel,
    '/entry/:id':   TopLevel,
});
