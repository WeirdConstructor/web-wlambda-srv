!@wlambda;
!@import std std;

!@export regex_match \:_regex_match_xxx { !text = _;
    !matches = _1;
    range 0 (len matches) 2 {
        !regex = _ matches;
        !fun   = (_ + 1) matches;
        std:re:match regex text {
            fun[_];
            return :_regex_match_xxx $n;
        };
    };
};
