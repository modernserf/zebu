import { lang } from '../lang';

export const re = lang`
  Prog   = Expr             : ${expr => new RegExp(expr)};
  Expr   = "?" identifier Alt : ${(_, name, expr) => `(?<${name}>${expr})`}
         | Alt;
  Alt    = Seq "|" Alt      :${(left, _, right) => `${left}|${right}`}
         | Seq;
  Seq    = Repeat Seq       : ${(left, right) => `${left}${right}`}
         | Repeat;
  Repeat = Seq "*"          : ${expr => `${expr}*`}
         | Seq "+"          : ${expr => `${expr}+`}
         | Seq "?"          : ${expr => `${expr}?`}
         | Seq #{ Span }    : ${(expr, [min, max]) => `${expr}{${min},${max}}`}
         | Base;
  Span   = value "," value  : ${(x, _, y) => [x, y]}
         | value ","        : ${x => [x, '']}
         | "," value        : ${(_, x) => [0, x]}
         | value            : ${x => [x, x]}
         ;
  Base   = #( Expr )        : ${expr => `(?:${expr})`}
         | "digit"          : ${() => `\\d`}
         | "ws"             : ${() => `\\s`}
         | "letter"         : ${() => `[A-Za-z]`}
         | "any"            : ${() => '.'}
         | "nil"            : ${() => ''}
         | "^"              : ${() => '^'}
         | "$"              : ${() => '$'}
         | value            : ${value => `(?:${escape(value)})`}
         ;
`;

function escape(value: string | RegExp) {
  if (value instanceof RegExp) {
    return value.source;
  }

  return value.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
}
