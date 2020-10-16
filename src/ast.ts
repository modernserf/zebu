import { identifierOrOperator, Token } from "./lexer";
import {
  Parser,
  Alt,
  Literal,
  TokType,
  Zero,
  Seq,
  Repeat,
  Lazy,
  SepBy,
  SeqMany,
} from "./parser";

const id = <T>(x: T) => x;
const nil = new Zero(() => null);
const struct = <T>(
  startToken: string,
  endToken: string,
  getParser: () => Parser<T>
) =>
  new SeqMany<T>((_, x, __) => x as T, [
    new Literal(startToken),
    new Lazy(getParser),
    new Literal(endToken),
  ]);
const optNil = <T>(parser: Parser<T>) => new Alt([parser, nil]);

//   Grammar = Rule ++ ";"
//           | AltExpr;
//   Rule    = identifier "=" AltExpr;
//   AltExpr = SeqExpr ** "|";
//   SeqExpr = SepExpr+ (":" value)?;
//   SepExpr = RepExpr "++" RepExpr
//           | RepExpr "**" RepExpr
//           | RepExpr;
//   RepExpr = Expr "*"
//           | Expr "+"
//           | Expr "?"
//           | Expr;
//   Expr    = #( AltExpr )
//           | "#" #( AltExpr )
//           | "#" #[ AltExpr ]
//           | "#" #{ AltExpr }
//           | "include" value
//           | identifier
//           | value;

const value = new TokType("value");
const ident = new TokType("identifier");
const hash = new Literal("#");

type SeqFn = (...xs: unknown[]) => unknown;
export type AST =
  | { type: "error"; message: string }
  | { type: "nil" }
  | { type: "literal"; value: string }
  | { type: "terminal"; value: Token["type"] }
  | { type: "identifier"; value: string }
  | { type: "include"; value: AST }
  | { type: "structure"; startToken: string; endToken: string; expr: AST }
  | { type: "maybe"; expr: AST }
  | { type: "repeat0"; expr: AST }
  | { type: "repeat1"; expr: AST }
  | { type: "sepBy0"; expr: AST; separator: AST }
  | { type: "sepBy1"; expr: AST; separator: AST }
  | { type: "seq"; exprs: AST[]; fn: SeqFn }
  | { type: "alt"; exprs: AST[] }
  | { type: "ruleset"; rules: Array<{ name: string; expr: AST }> };

const baseExpr = new Alt<AST>([
  struct("(", ")", () => altExpr),
  new Seq(
    (_, expr) => ({ type: "structure", startToken: "(", endToken: ")", expr }),
    hash,
    struct("(", ")", () => altExpr)
  ),
  new Seq(
    (_, expr) => ({ type: "structure", startToken: "[", endToken: "]", expr }),
    hash,
    struct("[", "]", () => altExpr)
  ),
  new Seq(
    (_, expr) => ({ type: "structure", startToken: "{", endToken: "}", expr }),
    hash,
    struct("{", "}", () => altExpr)
  ),
  new Seq(
    (_, value: any) => {
      if (!value || !value.ast) {
        return { type: "error", message: "include must be a grammar" };
      }
      return { type: "include", value: value.ast as AST };
    },
    new Literal("include"),
    value
  ),
  new Seq(
    (value) => ({ type: "terminal", value: value as Token["type"] }),
    new Alt([
      new Literal("value"),
      new Literal("identifier"),
      new Literal("operator"),
      new Literal("keyword"),
    ]),
    nil
  ),
  new Seq((value) => ({ type: "identifier", value }), ident, nil),
  new Seq(
    (value) => {
      if (typeof value !== "string") {
        return { type: "error", message: "literals must be strings" };
      }
      if (!identifierOrOperator.test(value)) {
        return {
          type: "error",
          message: "not a valid literal",
        };
      }
      return { type: "literal", value };
    },
    value,
    nil
  ),
]);

const repExpr = new Alt<AST>([
  new Seq((expr) => ({ type: "repeat0", expr }), baseExpr, new Literal("*")),
  new Seq((expr) => ({ type: "repeat1", expr }), baseExpr, new Literal("+")),
  new Seq((expr) => ({ type: "maybe", expr }), baseExpr, new Literal("?")),
  baseExpr,
]);

const sepExpr = new Alt<AST>([
  new Seq(
    (expr, separator) => ({ type: "sepBy0", expr, separator }),
    repExpr,
    new Seq((_, x) => x, new Literal("**"), repExpr)
  ),
  new Seq(
    (expr, separator) => ({ type: "sepBy1", expr, separator }),
    repExpr,
    new Seq((_, x) => x, new Literal("++"), repExpr)
  ),
  repExpr,
]);

const seqExpr: Parser<AST> = new Seq(
  (exprs, fn): AST => {
    if (fn === null && exprs.length === 1) {
      return exprs[0];
    }
    if (fn === null) fn = id;

    if (typeof fn !== "function") {
      return { type: "error", message: "seq needs a function" };
    }
    return { type: "seq", exprs, fn: fn as SeqFn };
  },
  new Seq((h, t) => [h, ...t], sepExpr, new Repeat(sepExpr)),
  optNil(new Seq((_, x) => x, new Literal(":"), value))
);

const altExpr: Parser<AST> = new Seq(
  (exprs) =>
    !exprs
      ? { type: "nil" }
      : exprs.length === 1
      ? exprs[0]
      : { type: "alt", exprs },
  optNil(new SepBy(seqExpr, new Literal("|"))),
  nil
);

const rule = new Seq(
  (name, expr) => ({ name, expr }),
  ident,
  new Seq((_, x) => x, new Literal("="), altExpr)
);

export const grammar = new Alt<AST>([
  new Seq(
    (rules) => ({ type: "ruleset", rules }),
    new SepBy(rule, new Literal(";")),
    nil
  ),
  altExpr,
]);
