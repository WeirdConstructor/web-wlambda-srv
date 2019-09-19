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
    std:re:match $q/^([-+\*])(.*)$/ _ {
        !op   = _.1;
        !term = _.2;
        return :ret ~ match op
            :?s "+" {|| $[:and, term] }
            :?s "-" {|| $[:not, term] }
            {|| $[:txt, term] };
    };

    $[:and, _]
};

!strip_match = \:ret { !(re, text) = @;
    std:re:match re text { return :ret $[_.1, _.2] };
    $[$n, text]
};

!parse_search = {
    !(order_term, tags) = strip_match $q/^\s*((?:c_|m_)(?:old|new))\s*(.*)$/ _;

    !or_terms = tags | std:re:map $q/\s*([^\|]+)\s*/ \_.1;
    .or_terms = or_terms { !or_term = _;
        !and_terms = or_term | std:re:map $q/\s*([^&\s]+)\s*/ \_.1;
        and_terms analyze_terms
    };
    ${ order = order_term, or_terms = or_terms }
};

!@export parse_search  parse_search;

!@export search_to_sql {
    !or = parse_search _;
    !colname = _1;
    !txtcolname = _2;
    !order_m = _3;
    !order_c = _4;

    !out_binds = $[];
    !sql = std:str:join " OR " ~ or.or_terms {
        std:str:cat "("
            (_ { !(typ, s) = _;
                std:push out_binds s;
                std:str:cat "("
                    ((typ == :not) { std:str:cat "not(instr(lower(" colname "), lower(?)))"; } {
                    (typ == :txt)  { std:str:cat "instr(lower(" txtcolname "), lower(?))"; }
                                   { std:str:cat "instr(lower(" colname "), lower(?))"; } })
                ")";
            } | std:str:join " AND ")
        ")";
    };

    !order = (not ~ is_none or.order) {
        match or.order
            :?s :c_old  { || std:str:cat order_c " ASC" }
            :?s :c_new  { || std:str:cat order_c " DESC" }
            :?s :m_old  { || std:str:cat order_m " ASC" }
            :?s :m_new  { || std:str:cat order_m " DESC" }
        ;
    };

    ${ where = sql, binds = out_binds, order = order }
};
