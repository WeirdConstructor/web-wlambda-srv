!:global local_endpoint = \ "127.0.0.1:19099" ;
!:global file_prefix    = { || "/files" };
!:global file_path      = { || "webdata/" };

!@import qweb;

!:global req = qweb:req;
