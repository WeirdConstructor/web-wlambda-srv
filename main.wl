!:global req = { !(method, path, data) = @;
    str:cat "foobar" method path
};
