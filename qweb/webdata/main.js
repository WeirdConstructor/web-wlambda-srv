"use strict";

var STATE = {
    display_id: "init",
    labels: {
        text: "Test 123",
    },
};

var DISPLAY = {
    init: ["hbox", {},
        ["label",  { src: "/labels/text" }],
        ["button", { action: "/btn1/click", state: "/labels/*" }, "Click"],
    ],
};

var MODAL = null;
function http_err(e) {
    MODAL = {};
    MODAL.cb = function() { };
    MODAL.text = "HTTP ERROR: " + e.message;
}

function rstate_elems(st, elems, offs) {
    if (offs == null) { offs = 0; }

    for (let i = offs; i < elems.length; i++) {
        if (st == null)
            return null;

        if (elems[i] == '*') {
            let out = [];
            for (let idx in st) {
                out.push(rstate_elems(st[idx], elems, i + 1));
            }
            st = out;

        } else {
            st = st[elems[i]];
        }
    }

    return st;
}

function rstate(path) {
    let elems = path.split('/');
    elems.shift()

    let st = rstate_elems(STATE, elems);

    console.log("rstate[" + path + "]:", st);

    return st;
}

function exec_state_update(update) {
    console.log("UPDATE:", update);
}

function desc2wid(widget_desc) {
    if (widget_desc[0] == "label") {
        return m("div", {}, rstate(widget_desc[1].src));

    } else if (widget_desc[0] == "button") {
        return m("button", {
            class: "button is-small",
            onclick: function() {
                let res = rstate(widget_desc[1].state);

                m.request({
                    method: "POST",
                    url: "/action/" + widget_desc[1].action,
                    body: res,
                }).then(function(data) {
                    exec_state_update(data);
                }).catch(function(e) {
                    http_err(e);
                });
            }
        }, widget_desc[2]);

    } else if (widget_desc[0] == "hbox") {
        let widgets = [];
        for (let i = 2; i < widget_desc.length; i++) {
            let child = widget_desc[i];
            widgets.push(
                m("div", { class: "column" },
                  [ desc2wid(child) ]));
        }

        return m("div", { class: "columns is-4" }, widgets)
    }
}

class ModalView {
    view(vn) {
        if (MODAL) {
            return m("div", { class: "modal is-active" }, [
                m("div", { class: "modal-background" }),
                m("div", { class: "modal-content" }, [
                    m("div", { class: "box content" }, [
                        m("div", MODAL.text),
                        m("div", { class: "columns" }, [
                            m("div", { class: "column" },
                                m("button", { class: "button is-fullwidth is-danger",
                                              onclick: function() { MODAL.cb(); MODAL = null; } }, "Yes")),
                            m("div", { class: "column" },
                                m("button", { class: "button is-fullwidth is-success",
                                              onclick: function() { MODAL = null; } }, "Cancel")),
                        ])
                    ])
                ])
            ]);
        } else {
            return m("div");
        }
    }
};

var Main = {
    view: function(vn) {
        let tree = desc2wid(DISPLAY[STATE.display_id]);
        //d// console.log("TREE:", tree);

        return m("div", { id: "top" }, [
            m("section", { class: "section", style: "padding-top: 0.5rem" }, [
                m(ModalView),
                tree,
            ])
        ]);
    },
};

m.route(document.body, '/main', {
    '/main': Main,
});
