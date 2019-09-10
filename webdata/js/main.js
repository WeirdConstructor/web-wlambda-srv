console.log("OK", [marked, m]);

var root = document.body;

console.log("GO;", root);
m.render(root, [
    m("h2", { class: "title" }, "FUCK THIS!"),
    m("p", { class: "content" },
        m.trust(
            marked("# Totally cool\n\nFU **CK**\n\n* a\n* b\n* c"))),
]);
