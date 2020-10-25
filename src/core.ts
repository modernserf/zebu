import { identifierOrOperator, Token } from "./lexer";
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
    // istanbul ignore next
    default:
      assertUnreachable(node);
  }
}

export function checkLit(x: string): AST {
  if (typeof x !== "string" || !identifierOrOperator.test(x)) {
    return { type: "error", message: "invalid pattern" };
  }
  return { type: "literal", value: x };
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

// prettier-ignore
export const coreAST = ruleset(
  rule("Grammar", 
    seq((rules) => ruleset(...rules), sepBy1(ident("Rule"), lit(";")))),
  rule("Rule", seq(
    (name, _, expr) => rule(name, expr),
    terminal('identifier'), lit('='), ident('AltExpr')
  )),
  rule('AltExpr', seq(
    (exprs) => exprs.length > 1 ? alt(...exprs): exprs[0],
    sepBy1(ident('SeqExpr'), lit('|')))
  ),
  rule('SeqExpr', seq(
    (exprs, fn) => (fn || exprs.length > 1) ? seq(fn, ...exprs) : exprs[0],
    repeat1(ident('SepExpr')),
    maybe(seq((_, expr) => expr, lit(":"), terminal('value')))
  )),
  rule('SepExpr', alt(
    seq((expr, _, sep) => sepBy0(expr, sep), 
      ident('RepExpr'), lit('**'), ident('RepExpr')),
    seq((expr, _, sep) => sepBy1(expr, sep), 
      ident('RepExpr'), lit('++'), ident('RepExpr')),
    ident('RepExpr'),
  )),
  rule('RepExpr', alt(
    seq(repeat0, ident('Expr'), lit('*')),
    seq(repeat1, ident('Expr'), lit('+')),
    seq(maybe, ident('Expr'), lit('?')),
    ident('Expr')
  )),
  rule('Expr', alt(
    structure('(', ident('AltExpr'), ')'),
    seq((_, expr) => structure('(', expr, ')'),
      lit('#'), structure('(', ident('AltExpr'), ')')
    ),
    seq((_, expr) => structure('[', expr, ']'),
      lit('#'), structure('[', ident('AltExpr'), ']')
    ),
    seq((_, expr) => structure('{', expr, '}'),
      lit('#'), structure('{', ident('AltExpr'), '}')
    ),
    seq(
      (_, lang) => lang && lang.ast || error('expected a language or AST'), 
      lit('include'), terminal('value')),
    seq(ident, terminal('identifier')),
    seq(() => terminal('identifier'), lit('identifier')),
    seq(() => terminal('operator'), lit('operator')),
    seq(() => terminal('keyword'), lit('keyword')),
    seq(() => terminal('value'), lit('value')),
    seq(() => seq(() => null), lit('nil')),
    seq(
      checkLit,
      terminal('value')
    )
  ))
);
