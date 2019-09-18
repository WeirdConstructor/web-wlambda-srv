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

!analyze_terms = \:ret {
    std:re:match $q/^([-+])(.*)$/ _ {
        !op   = _.1;
        !term = _.2;
        return :ret ~ (op == "+") { $[:and, term] } { $[:not, term] };
    };

    $[:and, _]
};

!strip_match = \:ret { !(re, text) = @;
    std:re:match re text { return :ret $[_.1, _.2] };
    $[$n, text]
};

!@export parse_search {
    !(order_term, tags) = strip_match $q/^\s*((?:c_|m_)(?:old|new))\s*(.*)$/ _;

    !or_terms = tags | std:re:map $q/\s*([^\|]+)\s*/ \_.1;
    .or_terms = or_terms { !or_term = _;
        !and_terms = or_term | std:re:map $q/\s*([^&\s]+)\s*/ \_.1;
        and_terms analyze_terms
    };
    ${ order = order_term, or_terms = or_terms }
}
