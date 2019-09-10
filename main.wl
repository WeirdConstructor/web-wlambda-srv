!:global auth_realm = { "wctor_journal" };
!:global local_endpoint = { "0.0.0.0:19099" };
!:global auth = { !(method, path, auth) = @;
    auth.1 == "wctor:******"
};
!:global req = { !(method, path, data) = @;
    str:cat "foobar" method path data.x
};

db:connect_sqlite "xxx.sqlite";
is_err ~ db:exec "CREATE TABLE xxx (name TEXT);";
db:exec "INSERT INTO xxx VALUES('fooobar')";
db:exec "INSERT INTO xxx VALUES(?)" "fofoe ewoif jwf w' fweiofj w";
"SELECT * FROM xxx" | db:exec | displayln;
