#!:global auth_realm     = \ "wctor_journal" ;
#!:global local_endpoint = \ "127.0.0.1:19099" ;
#!:global file_prefix    = { || "/files" };
#!:global file_path      = { || "webdata/" };
#!:global need_auth      = { || };
#!:global auth           = { || };

!@wlambda;
!@import std;

!@export req = {
    !(method, path, data, url, qp) = @;

    !data = block :from_req {
        !t = std:str:cat method ":" path;
        match t
            $r[$^GET\:/main$$] => {
                return :from_req [1,2,3,4];
            }
            { $e $["No URL Handler!", t] };
};
