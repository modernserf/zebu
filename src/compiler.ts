import { AST } from "./ast";
import {
  Zero,
  Literal,
  Parser,
  Lazy,
  TokType,
  Seq,
  SeqMany,
  Alt,
  Repeat,
  SepBy,
} from "./parser";

const nil = new Zero(() => null);
const emptyList = new Zero(() => []);

function assertUnreachable(_: never): never {
  throw new Error();
}

export const rootLanguageLiterals = [
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  "#",
  ":",
  ";",
  ",",
  "+",
  "|",
  "=",
  "++",
  "**",
  "*",
  "?",
];

class Compiler {
  private scope: Map<string, Parser<unknown>>;
  private ruleNames: Set<string> = new Set();
  private literals: Set<string> = new Set();
  constructor() {
    this.scope = new Map<string, Parser<unknown>>([
      ["identifier", new TokType("identifier")],
      ["value", new TokType("value")],
      ["operator", new TokType("operator")],
      ["keyword", new TokType("keyword")],
    ]);
  }
  compile(node: AST) {
    return {
      parser: this.compileExpr(node),
      literals: Array.from(this.literals),
    };
  }

  private compileExpr(node: AST): Parser<unknown> {
    switch (node.type) {
      case "error":
        throw new Error(node.message);
      case "nil":
        return nil;
      case "literal":
        this.literals.add(node.value);
        return new Literal(node.value);
      case "identifier": {
        const value = this.scope.get(node.value);
        if (!value) {
          if (this.ruleNames.has(node.value)) {
            throw new Error("rule cannot be used here");
          }
          throw new Error("unknown identifier");
        }
        return value;
      }
      case "include": {
        const parser = node.value(this.scope);
        if (typeof parser.parse !== "function") throw new Error("not a parser");
        return parser;
      }
      case "structure":
        this.literals.add(node.startToken);
        this.literals.add(node.endToken);
        return new SeqMany((_, x, __) => x, [
          new Literal(node.startToken),
          new Lazy(() => this.compileExpr(node.expr)),
          new Literal(node.endToken),
        ]);
      case "maybe":
        return new Alt([this.compileExpr(node.expr), nil]);
      case "repeat0":
        return new Repeat(this.compileExpr(node.expr));
      case "repeat1": {
        const parser = this.compileExpr(node.expr);
        return new Seq((h, t) => [h, ...t], parser, new Repeat(parser));
      }
      case "sepBy0":
        return new Alt([
          new SepBy(
            this.compileExpr(node.expr),
            this.compileExpr(node.separator)
          ),
          emptyList,
        ]);
      case "sepBy1":
        return new SepBy(
          this.compileExpr(node.expr),
          this.compileExpr(node.separator)
        );
      case "seq":
        return new SeqMany(
          node.fn as (...xs: unknown[]) => unknown,
          node.exprs.map((expr) => this.compileExpr(expr))
        );
      case "alt":
        return new Alt(node.exprs.map((expr) => this.compileExpr(expr)));
      case "ruleset":
        return this.compileRuleset(node.rules);
      default:
        return assertUnreachable(node);
    }
  }
  private compileRuleset(ruleset: Array<{ name: string; expr: AST }>) {
    this.ruleNames = new Set(ruleset.map((rule) => rule.name));
    let lastParser: Parser<unknown> = nil;
    // Go in reverse so bottom rules are defined before top ones
    for (const { name, expr } of ruleset.slice().reverse()) {
      lastParser = this.compileExpr(expr);
      this.scope.set(name, lastParser);
    }

    return lastParser;
  }
}

export function compile(
  node: AST
): { parser: Parser<unknown>; literals: string[] } {
  return new Compiler().compile(node);
}
