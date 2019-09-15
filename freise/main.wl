!@import u util;

!:global auth_realm     = \ "wctor_journal" ;
!:global local_endpoint = \ "0.0.0.0:19100" ;
!:global auth           = { !(method, path, auth) = @; $t };
!:global req = \:from_req {
    !(method, path, data) = @;

    !t = std:str:cat method ":" path;
    u:regex_match t $[
        $q"^POST:/search/entries", {||
        },
    ];
    $e "No URL Handler!"
};
