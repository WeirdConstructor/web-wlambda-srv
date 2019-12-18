m.route(document.body, '/public', {
    '/public':             TopPublic,
    '/public/entry/:id':   TopPublic,
});
