import { AST } from "./ast";
import { Token } from "./lexer";

type SeqFn = (...xs: any[]) => unknown;

const error = (message: string): AST => ({ type: "error", message });
const nil: AST = { type: "nil" };
const ident = (value: string): AST => ({ type: "identifier", value });
const lit = (value: string): AST => ({ type: "literal", value });
const terminal = (value: Token["type"]): AST => ({ type: "terminal", value });
const alt = (...exprs: AST[]): AST => ({ type: "alt", exprs });
const seq = (fn: SeqFn, ...exprs: AST[]): AST => ({ type: "seq", fn, exprs });
const rule = (name: string, expr: AST) => ({ name, expr });
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
export const coreAST = ruleset(
  rule("Grammar", alt(
    sepBy1(ident("Rule"), lit(";")),
    ident("AltExpr")  
  )),
  rule("Rule", seq(
    (name, _, expr) => rule(name, expr),
    terminal('identifier'), lit('='), ident('AltExpr')
  )),
  rule('AltExpr', seq(
    (exprs) => alt(...exprs), 
    sepBy1(ident('SeqExpr'), lit('|')))
  ),
  rule('SeqExpr', seq(
    (exprs, fn) => seq(fn || ((x) => x), ...exprs),
    repeat1(ident('SepExpr')), 
    maybe(seq((_, expr) => expr, lit(":"), terminal('value')))
  )),
  rule('SepExpr', alt(
    seq(
      (expr, _, separator) => sepBy1(expr, separator),
      ident('RepExpr'), lit('++'), ident('RepExpr')
    ),
    seq(
      (expr, _, separator) => sepBy0(expr, separator),
      ident('RepExpr'), lit('**'), ident('RepExpr')
    ),
    ident('RepExpr')
  )),
  rule('RepExpr', alt(
    seq(repeat0, ident('Expr'), lit('*')),
    seq(repeat1, ident('Expr'), lit('+')),
    seq(maybe, ident('Expr'), lit('?')),
    ident('Expr'),
  )),
  rule('Expr', alt(
    structure('(', ident('AltExpr'), ')'),
    seq((_, expr) => structure('(', expr, ')'), 
      lit('#'), structure('(', ident('AltExpr'), ')')),
    seq((_, expr) => structure('[', expr, ']'), 
      lit('#'), structure('[', ident('AltExpr'), ']')),
    seq((_, expr) => structure('{', expr, '}'), 
      lit('#'), structure('{', ident('AltExpr'), '}')),
    seq((_, lang) => (lang && lang.ast) || error('expected AST'),
      lit('include'), terminal('value')),
    seq(ident, terminal('identifier')),
    seq(() => terminal('identifier'), lit('identifier')),
    seq(() => terminal('operator'), lit('operator')),
    seq(() => terminal('keyword'), lit('keyword')),
    seq(() => terminal('value'), lit('value')),
    seq(() => nil, lit('nil')),
    seq(
      (value) => typeof value === "string" ? lit(value) : error('literals must be strings'),
      terminal('value')
    )
  ))
);
