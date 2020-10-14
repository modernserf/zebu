import { identifierOrOperator } from "./lexer";
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

type IncludeFn = (x: Map<string, Parser<unknown>>) => Parser<unknown>;
type SeqFn = (...xs: unknown[]) => unknown;
export type ASTExpr =
  | { type: "error"; message: string }
  | { type: "nil" }
  | { type: "literal"; value: string }
  | { type: "identifier"; value: string }
  | { type: "include"; value: IncludeFn }
  | { type: "structure"; startToken: string; endToken: string; expr: ASTExpr }
  | { type: "maybe"; expr: ASTExpr }
  | { type: "repeat0"; expr: ASTExpr }
  | { type: "repeat1"; expr: ASTExpr }
  | { type: "sepBy0"; expr: ASTExpr; separator: ASTExpr }
  | { type: "sepBy1"; expr: ASTExpr; separator: ASTExpr }
  | { type: "seq"; exprs: ASTExpr[]; fn: SeqFn }
  | { type: "alt"; exprs: ASTExpr[] };

export type AST =
  | { type: "ruleset"; rules: Array<{ name: string; expr: ASTExpr }> }
  | ASTExpr;

const baseExpr = new Alt<ASTExpr>([
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
    (_, value) =>
      typeof value === "function"
        ? { type: "include", value: value as IncludeFn }
        : { type: "error", message: "include must be function" },
    new Literal("include"),
    value
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

const repExpr = new Alt<ASTExpr>([
  new Seq((expr) => ({ type: "repeat0", expr }), baseExpr, new Literal("*")),
  new Seq((expr) => ({ type: "repeat1", expr }), baseExpr, new Literal("+")),
  new Seq((expr) => ({ type: "maybe", expr }), baseExpr, new Literal("?")),
  baseExpr,
]);

const sepExpr = new Alt<ASTExpr>([
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

const seqExpr: Parser<ASTExpr> = new Seq(
  (exprs, fn): ASTExpr => {
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

const altExpr: Parser<ASTExpr> = new Seq(
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
