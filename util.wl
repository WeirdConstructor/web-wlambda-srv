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

!:global analyze_terms = \:ret {
    std:re:match $q/^([-+\*])(.*)$/ _ {
        !op   = _.1;
        !term = _.2;
        return :ret ~ match (str op)
            "+" => { $[:and, term] }
            "-" => { $[:not, term] }
            { $[:txt, term] };
    };

    $[:and, _]
};

!:global strip_match = \:ret { !(re, text) = @;
    std:re:match re text { return :ret $[_.1, _.2] };
    $[$n, text]
};

!parse_search = {
    !(order_term, tags) = strip_match $q/^\s*((?:t_|c_|m_)(?:old|new))\s*(.*)$/ _;

    !or_terms = $@v tags | std:re:map $q/\s*([^\|]+)\s*/ \$+ _.1;
    .or_terms = $@v or_terms { !or_term = _;
        !and_terms = $@v or_term | std:re:map $q/\s*([^&\s]+)\s*/ \$+ _.1;
        $+ $@v and_terms \$+ ~ analyze_terms _;
    };
    std:displayln "ORTERMS:[" or_terms "]";
    ${ order = order_term, or_terms = or_terms }
};

!@export parse_search  parse_search;

!@export search_to_sql {
    !sql = $[];
    !binds = $[];

    !p = std:push;
    !i = 0;
    p sql "SELECT * FROM entries ex WHERE ex.deleted=0 AND (";
    !got_or_term = $&$f;
    p sql ~ ($@v _.or_terms {
        !or = $[];
        .got_or_term = $t;
        p or "(ex.id IN (";
        p or "SELECT e.id FROM entries e";
        !where = $["(e.deleted=0)"];
        std:displayln "ORTERM[" _ "]";
        _ {
            !(typ, s) = _;
            std:displayln "TYP S" typ ";" s;
            .i = i + 1;
            !tbl = std:str:cat "t" i;
            !tble = std:str:cat "te" i;
            p or ~ std:str:cat "LEFT JOIN tag_entries " tble " ON e.id = " tble ".entry_id";
            p or ~ std:str:cat
                "LEFT JOIN tags " tbl " "
                "ON " tbl ".id = " tble ".tag_id AND "
                ~ std:str:cat "("
                    ((typ == :txt)  { std:str:cat "instr(lower(" tbl ".name || ' ' || e.body), lower(?))"; }
                        {(typ == :not)  { std:str:cat "instr(lower(" tbl ".name), lower(?))"; }
                                        { std:str:cat "instr(lower(" tbl ".name), lower(?))"; }})
                  ")";
            std:push binds s;
            (typ == :not) {
                std:push where ~ std:str:cat tbl ".id IS NULL";
            } {
                std:push where ~ std:str:cat tbl ".id IS NOT NULL";
            };
        };
        p or " WHERE ";
        p or ~ std:str:join " AND " where;
        p or "))";
        $+ ~ std:str:join " " or
    }) | std:str:join " OR ";

    (not $*got_or_term) \p sql "1=1";

    p sql ")";

    !order = _.order;
    (not ~ is_none order) {
        p sql " ORDER BY ";
        p sql ~ match (sym order)
            :c_old => { std:str:cat "ctime ASC" }
            :c_new => { std:str:cat "ctime DESC" }
            :m_old => { std:str:cat "mtime ASC" }
            :m_new => { std:str:cat "mtime DESC" }
            :t_old => { std:str:cat "tags ASC" }
            :t_new => { std:str:cat "tags DESC" };
    };

    std:push sql " LIMIT 40 ";

    ${ sql = std:str:join " " sql, binds = binds }
};

!diff2txt = { !diff = _;
    ($@v diff { !(idx, ch, l) = _;
        ch == $n {
            $+ ~ std:str:cat "= " l;
        };
        ch == $f {
            $+ ~ std:str:cat "- " l;
        };
        ch == $t {
            $+ ~ std:str:cat "+ " l;
        };
    }) | std:str:join "\n"
};

!@export diff2txt = diff2txt;

#!@export search_to_sql {
#    !or         = parse_search _;
#    !colname    = _1;
#    !tagcolname = _2;
#    !txtcolname = _3;
#    !order_m    = _4;
#    !order_c    = _5;
#
#    !out_binds = $[];
#    !sql = std:str:join " OR " ~ or.or_terms {
#        std:str:cat "("
#            (_ { !(typ, s) = _;
#                std:push out_binds s;
#                std:str:cat "("
#                    ((typ == :txt)  { std:str:cat "instr(lower(" txtcolname "), lower(?))"; }
#                                    { std:str:cat "instr(lower(" colname "), lower(?))"; })
#                ")";
#            } | std:str:join " AND ")
#        ")";
#    };
#
#    !order = (not ~ is_none or.order) {
#        match or.order
#            :?s :c_old  { || std:str:cat "ctime ASC" }
#            :?s :c_new  { || std:str:cat "ctime DESC" }
#            :?s :m_old  { || std:str:cat "mtime ASC" }
#            :?s :m_new  { || std:str:cat "mtime DESC" }
#            :?s :t_old  { || std:str:cat "tags ASC" }
#            :?s :t_new  { || std:str:cat "tags DESC" }
#        ;
#    };
#
#    ${ where = sql, binds = out_binds, order = order }
#};
