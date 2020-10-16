import { AST } from "./ast";
import {
  Zero,
  Literal,
  Parser,
  TokType,
  Seq,
  SeqMany,
  Alt,
  Repeat,
  SepBy,
  ParseSubject,
} from "./parser";

const nil = new Zero(() => null);
const emptyList = new Zero(() => []);

function assertUnreachable(value: never): never {
  throw new Error(`shouldnt have gotten ${value}`);
}

class Scope<Key, Value> {
  constructor(
    private readonly map: Map<Key, Value>,
    private readonly parent: Scope<Key, Value> | null = null
  ) {}
  get(key: Key): Value | undefined {
    if (this.map.has(key)) return this.map.get(key);
    if (this.parent) return this.parent.get(key);
    return undefined;
  }
  has(key: Key): boolean {
    if (this.map.has(key)) return true;
    if (this.parent) return this.parent.has(key);
    return false;
  }
  set(key: Key, value: Value) {
    this.map.set(key, value);
    return this;
  }
  create() {
    return new Scope(new Map(), this);
  }
  pop() {
    if (this.parent) return this.parent;
    throw new Error("no outer scope");
  }
  *keys() {
    yield* this.map.keys();
    if (this.parent) yield* this.parent.keys();
  }
}

// TODO: add error tracking stuff
class RuleReference implements Parser<unknown> {
  constructor(
    private name: string,
    private scope: Scope<string, Parser<unknown> | null>
  ) {}
  get firstTokenOptions() {
    const parser = this.scope.get(this.name);
    if (!parser) throw new Error("unknown parser (firstTokenOptions)");
    return parser.firstTokenOptions;
  }
  parse(subject: ParseSubject) {
    const parser = this.scope.get(this.name);
    if (!parser) throw new Error("unknown parser (parse)");
    return parser.parse(subject);
  }
}

class Compiler {
  private scope: Scope<string, Parser<unknown> | null>;
  private literals: Set<string> = new Set();
  constructor() {
    this.scope = new Scope(
      new Map<string, Parser<unknown>>([
        ["identifier", new TokType("identifier")],
        ["value", new TokType("value")],
        ["operator", new TokType("operator")],
        ["keyword", new TokType("keyword")],
      ])
    );
  }
  compile(node: AST) {
    const parser = this.compileExpr(node);
    const literals = Array.from(this.literals);
    return { parser, literals };
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
      case "terminal":
        return new TokType(node.value);
      case "identifier": {
        if (!this.scope.has(node.value)) {
          throw new Error(`unknown identifier ${node.value}`);
        }
        return new RuleReference(node.value, this.scope);
      }
      case "structure":
        this.literals.add(node.startToken);
        this.literals.add(node.endToken);
        return new SeqMany((_, x, __) => x, [
          new Literal(node.startToken),
          this.compileExpr(node.expr),
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
    this.scope = this.scope.create();
    // first, add nulls as placeholders to scope
    for (const { name } of ruleset) {
      this.scope.set(name, null);
    }

    // then, try compiling the rules
    // rules will mostly be defined top to bottom, so start from bottom
    let lastParser: Parser<unknown> = nil;
    for (const { name, expr } of ruleset.slice().reverse()) {
      lastParser = this.compileExpr(expr);
      this.scope.set(name, lastParser);
    }

    this.scope = this.scope.pop();
    return lastParser;
  }
}

export function compile(
  node: AST
): { parser: Parser<unknown>; literals: string[] } {
  return new Compiler().compile(node);
}
