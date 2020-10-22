import { Token } from "./lexer";
import { assertUnreachable } from "./util";

export type AST =
  | { type: "error"; message: string }
  | { type: "literal"; value: string }
  | { type: "terminal"; value: Token["type"] }
  | { type: "identifier"; value: string }
  | { type: "structure"; startToken: string; endToken: string; expr: AST }
  | { type: "maybe"; expr: AST }
  | { type: "repeat0"; expr: AST }
  | { type: "repeat1"; expr: AST }
  | { type: "sepBy0"; expr: AST; separator: AST }
  | { type: "sepBy1"; expr: AST; separator: AST }
  | { type: "seq"; exprs: AST[]; fn: SeqFn | null }
  | { type: "alt"; exprs: AST[] }
  | { type: "ruleset"; rules: Array<{ name: string; expr: AST }> };

const spaces = (n: number) => Array(n).fill(" ").join("");
const wrapIf = (cond: boolean, str: string) => (cond ? `(${str})` : str);
export function print(node: AST, indent = 0, prec = 0): string {
  switch (node.type) {
    case "error":
      return `<error: ${node.message}>`;
    case "literal":
      return `"${node.value}"`;
    case "terminal":
      return node.value;
    case "identifier":
      return node.value;
    case "structure":
      return `#${node.startToken} ${print(node.expr, indent)} ${node.endToken}`;
    case "maybe":
      return wrapIf(prec > 3, `${print(node.expr, indent, 4)}?`);
    case "repeat0":
      return wrapIf(prec > 3, `${print(node.expr, indent, 4)}*`);
    case "repeat1":
      return wrapIf(prec > 3, `${print(node.expr, indent, 4)}+`);
    case "sepBy0":
      return wrapIf(
        prec > 2,
        `${print(node.expr, indent, 3)} ** ${print(node.separator, indent, 3)}`
      );
    case "sepBy1":
      return wrapIf(
        prec > 2,
        `${print(node.expr, indent, 3)} ++ ${print(node.separator, indent, 3)}`
      );
    case "seq":
      return (
        wrapIf(
          prec > 1,
          node.exprs.map((expr) => print(expr, indent, 2)).join(" ")
        ) || "nil"
      );
    case "alt":
      return wrapIf(
        prec > 0,
        node.exprs.map((expr) => print(expr, indent, 1)).join(` | `)
      );
    case "ruleset":
      return node.rules
        .map((rule) =>
          rule.expr.type === "alt"
            ? `\n${spaces(indent)}${rule.name} = ${rule.expr.exprs
                .map((expr) => print(expr, indent))
                .join(`\n${spaces(indent + rule.name.length)} | `)}`
            : `\n${spaces(indent)}${rule.name} = ${print(rule.expr, indent)}`
        )
        .join("");
    default:
      // istanbul ignore next
      assertUnreachable(node);
  }
}

type SeqFn = (...xs: any[]) => unknown;

const error = (message: string): AST => ({ type: "error", message });
const ident = (value: string): AST => ({ type: "identifier", value });
const lit = (value: string): AST => ({ type: "literal", value });
const terminal = (value: Token["type"]): AST => ({ type: "terminal", value });
const alt = (...exprs: AST[]): AST => ({ type: "alt", exprs });
const seq = (fn: SeqFn | null, ...exprs: AST[]): AST => ({
  type: "seq",
  fn,
  exprs,
});
const rule = (name: string, expr: AST): { name: string; expr: AST } => ({
  name,
  expr,
});
const ruleset = (...rules: Array<{ name: string; expr: AST }>): AST => ({
  type: "ruleset",
  rules,
});
const repeat0 = (expr: AST): AST => ({ type: "repeat0", expr });
const repeat1 = (expr: AST): AST => ({ type: "repeat1", expr });
const maybe = (expr: AST): AST => ({ type: "maybe", expr });
const sepBy0 = (expr: AST, separator: AST): AST => ({
  type: "sepBy0",
  expr,
  separator,
});
const sepBy1 = (expr: AST, separator: AST): AST => ({
  type: "sepBy1",
  expr,
  separator,
});
const structure = (startToken: string, expr: AST, endToken: string): AST => ({
  type: "structure",
  expr,
  startToken,
  endToken,
});

// prettier-ignore
export const builders = { 
  error, ident, lit, terminal, 
  alt, seq, repeat0, repeat1, maybe, sepBy0, sepBy1, structure,
  rule, ruleset,
}

const wrapRep = {
  "+": (expr) => repeat1(expr),
  "*": (expr) => repeat0(expr),
  "?": (expr) => maybe(expr),
  null: (expr) => expr,
};

// prettier-ignore
export const coreAST = ruleset(
  rule("Grammar", 
    seq((rules) => ruleset(...rules), sepBy1(ident("Rule"), lit(";")))),
  rule("Rule", seq(
    (name, _, expr) => rule(name, expr),
    terminal('identifier'), lit('='), ident('AltExpr')
  )),
  rule('AltExpr', seq(
    (exprs) => alt(...exprs),
    sepBy1(ident('SeqExpr'), lit('|')))
  ),
  rule('SeqExpr', seq(
    (exprs, fn) => seq(fn, ...exprs),
    repeat1(ident('SepExpr')),
    maybe(seq((_, expr) => expr, lit(":"), terminal('value')))
  )),
  rule('SepExpr', seq(
    (expr, fn) => fn(expr),
    ident('RepExpr'),
    alt(
      seq((_, sep) => (expr) => sepBy0(expr, sep), lit('**'), ident('RepExpr')),
      seq((_, sep) => (expr) => sepBy1(expr, sep), lit('++'), ident('RepExpr')),
      seq(() => (expr) => expr)
    )
  )),
  rule('RepExpr', seq((expr, tag) => wrapRep[tag](expr),
      ident('Expr'), maybe(alt(lit('*'), lit('+'), lit('?'))),
  )),
  rule('Expr', alt(
    structure('(', ident('AltExpr'), ')'),
    seq((_, [first, expr, last]) => structure(first, expr, last),
      lit('#'), alt(
        seq((xs) => ['(', xs, ')'], structure('(', ident('AltExpr'), ')')),
        seq((xs) => ['{', xs, '}'], structure('{', ident('AltExpr'), '}')),
        seq((xs) => ['[', xs, ']'], structure('[', ident('AltExpr'), ']')),
      )),
    seq(
      (_, lang) => lang && lang.ast || error('expected a language or AST here'), 
      lit('include'), terminal('value')),
    seq(ident, terminal('identifier')),
    seq(() => terminal('identifier'), lit('identifier')),
    seq(() => terminal('operator'), lit('operator')),
    seq(() => terminal('keyword'), lit('keyword')),
    seq(() => terminal('value'), lit('value')),
    seq(() => seq(() => null), lit('nil')),
    seq(
      (value) => lit(value),
      terminal('value')
    )
  ))
);
