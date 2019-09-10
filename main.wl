!:global auth_realm = { "wctor_journal" };
!:global local_endpoint = { "0.0.0.0:19099" };
!:global auth = { !(method, path, auth) = @;
    auth.1 == "wctor:******"
};
!:global req = { !(method, path, data) = @;
    str:cat "foobar" method path data.x
};
