import { lang, tag } from '../index';

// prettier-ignore
export const zebu = lang`
  Program = Rule ++ ";"             : ${tag`ruleset rules`};
  Rule    = identifier "=" AltExpr  : ${(name, _, expr) => ({ name, expr })};

  AltExpr = "|"? SeqExpr AltRest*   
          : ${(_, head, tail) => tail ? ({ type: 'alt', exprs: [head, ...tail] }) : head};
  AltRest = "|" SeqExpr             : ${(_, expr) => expr};

  SeqExpr = SepExpr SeqTail?        : ${(head, tail) => tail ? tail(head) : head};
  SeqTail = SepExpr* ":" value
          : ${(tail, _,fn) => (head) => ({ type: 'seq', fn, exprs: [head, ...tail] })};

  SepExpr = SepExpr "++" RepExpr    : ${tag`sepBy1 expr _ separator`}
          | SepExpr "**" RepExpr    : ${tag`sepBy0 expr _ separator`}
          | RepExpr;

  RepExpr = BaseExpr "+"            : ${tag`repeat1 expr`}
          | BaseExpr "*"            : ${tag`repeat0 expr`}
          | BaseExpr "?"            : ${tag`maybe expr`}
          | BaseExpr;

  BaseExpr =
    | #( AltExpr )
    | "#" #( AltExpr )  : ${tag`structure _ expr startToken="(" endToken=")"`}
    | "#" #[ AltExpr ]  : ${tag`structure _ expr startToken="[" endToken="]"`}
    | "#" #{ AltExpr }  : ${tag`structure _ expr startToken="{" endToken="}"`}
    | "include" AST     : ${tag`include _ ast`}
    | "value"           : ${tag`terminal value="value"`} 
    | "identifier"      : ${tag`terminal value="identifier"`} 
    | "keyword"         : ${tag`terminal value="keyword"`} 
    | "operator"        : ${tag`terminal value="operator"`}
    | "nil"             : ${tag`seq exprs=${[]} fn=${() => null}`}
    | identifier        : ${tag`identifier value`}
    | value             : ${tag`literal value`};

  AST = value : ${(value) => value.ast};
`;
