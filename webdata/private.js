m.route(document.body, '/main', {
    '/main':               TopLevel,
    '/week/:week':         TopLevel,
    '/entry/:id':          TopLevel,
    '/public':             TopPublic,
    '/public/entry/:id':   TopPublic,
});
