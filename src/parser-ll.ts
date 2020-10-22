import { AST } from "./core";
import { identifierPattern, Lexer, Token } from "./lexer";
import { assertUnreachable } from "./util";

type RuleFrame = {
  type: "rule";
  name: symbol;
};

type ParseErrorStackFrame = Token | RuleFrame;

class ParseError {
  public stack: ParseErrorStackFrame[] = [];
  constructor(public readonly message: string) {}
}

class MatchError extends ParseError {
  constructor(expected: string, received: Token | null) {
    super(`Expected ${expected}, received ${brandToken(received)}`);
    if (received) {
      this.stack.push(received);
    }
  }
}

type Brand<K, T> = K & { __brand: T };
type Terminal = Brand<string, "Terminal">;
const brandLiteral = (value: string) => `"${value}"` as Terminal;
const brandType = (type: string) => `<${type}>` as Terminal;
const brandEof = "(end of input)" as Terminal;
const brandToken = (token: Token | null) => {
  if (!token) return brandEof;
  if (token.type === "identifier" || token.type === "value") {
    return brandType(token.type);
  } else {
    return brandLiteral(token.value);
  }
};

class ParseState {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  next(): Token | null {
    return this.tokens[this.index++];
  }
  peek(): Token | null {
    return this.tokens[this.index] || null;
  }
}

export interface Parser<T> {
  parse(state: ParseState): T;
}

class MatchType implements Parser<unknown> {
  constructor(private type: "identifier" | "value") {}
  parse(state: ParseState) {
    const token = state.next();
    if (!token || token.type !== this.type) {
      throw new MatchError(brandType(this.type), token);
    }
    return token.value;
  }
}

class MatchLiteral implements Parser<string> {
  constructor(private value: string) {}
  parse(state: ParseState) {
    const token = state.next();
    if (
      !token ||
      !["operator", "keyword"].includes(token.type) ||
      token.value !== this.value
    ) {
      throw new MatchError(brandLiteral(this.value), token);
    }
    return token.value;
  }
}

class MatchRule<T> implements Parser<T> {
  constructor(
    private parsers: Map<symbol, Parser<T>>,
    private ruleName: symbol
  ) {}
  parse(state: ParseState) {
    try {
      return this.parsers.get(this.ruleName)!.parse(state);
    } catch (e) {
      if (e instanceof ParseError) {
        e.stack.push({ type: "rule", name: this.ruleName });
      }
      throw e;
    }
  }
}

type SeqFn = (...xs: unknown[]) => unknown;

class Seq<T> implements Parser<T> {
  constructor(private fn: SeqFn | null, private parsers: Parser<T>[]) {}
  parse(state: ParseState) {
    const results: T[] = [];
    for (const parser of this.parsers) {
      results.push(parser.parse(state));
    }
    if (this.fn) {
      return this.fn(...results) as T;
    }
    return results.pop()!;
  }
}

class Alt<T> implements Parser<T> {
  constructor(private parserMap: Map<Terminal, Parser<T>>) {}
  parse(state: ParseState) {
    const token = state.peek();
    let parser = this.parserMap.get(brandToken(token));
    if (!parser) {
      parser = this.parserMap.get(brandEof);
    }
    if (!parser) {
      throw new MatchError([...this.parserMap.keys()].join(), token);
    }
    return parser.parse(state);
  }
}

class Repeat<T> implements Parser<T[]> {
  constructor(private parser: Parser<T>, private matchSet: Set<Terminal>) {}
  parse(state: ParseState) {
    const results: T[] = [];
    while (this.matchSet.has(brandToken(state.peek()))) {
      results.push(this.parser.parse(state));
    }
    return results;
  }
}

export type SimpleAST =
  | { type: "literal"; value: string }
  | { type: "identifier" }
  | { type: "value" }
  | { type: "nonterminal"; value: symbol }
  | { type: "repeat0"; expr: SimpleAST }
  | { type: "seq"; exprs: SimpleAST[]; fn: SeqFn | null }
  | { type: "alt"; exprs: SimpleAST[] };

const _2 = (_, x) => x;
const cons = (h, t: unknown[]) => [h, ...t];
const pushNull: SimpleAST = { type: "seq", exprs: [], fn: () => null };
const pushArr: SimpleAST = { type: "seq", exprs: [], fn: () => [] };

export class ASTSimplifier {
  rules = new Map<symbol, SimpleAST>();
  scope = new ScopeManager();
  literals = new LiteralManager();
  static simplifyAll(node: AST) {
    return new ASTSimplifier().simplifyAll(node);
  }
  private simplifyAll(node: AST) {
    const startRule = Symbol("start");
    this.rules.set(startRule, this.simplify(node));

    const { keywords, operators } = this.literals.compile(this.rules);
    return {
      startRule,
      rules: this.rules,
      keywords,
      operators,
    };
  }
  private simplify(node: AST): SimpleAST {
    switch (node.type) {
      case "error":
        throw new Error(node.message);
      case "ruleset":
        return this.scope.compileRuleset(node.rules, (name, expr) => {
          this.rules.set(name, this.simplify(expr));
        });
      case "literal":
        return this.literals.add(node.value);
      case "terminal":
        return this.literals.terminal(node);
      case "identifier":
        return { type: "nonterminal", value: this.scope.lookup(node.value) };
      case "structure":
        return {
          type: "seq",
          exprs: [
            this.literals.add(node.startToken),
            this.simplify(node.expr),
            this.literals.add(node.endToken),
          ],
          fn: _2,
        };
      case "seq":
        return {
          type: "seq",
          exprs: node.exprs.map((expr) => this.simplify(expr)),
          fn: node.fn,
        };
      case "alt":
        return {
          type: "alt",
          exprs: node.exprs.map((expr) => this.simplify(expr)),
        };
      case "repeat0":
        return { type: "repeat0", expr: this.simplify(node.expr) };
      case "repeat1": {
        const expr = this.simplify(node.expr);
        return {
          type: "seq",
          exprs: [expr, { type: "repeat0", expr }],
          fn: cons,
        };
      }
      case "maybe":
        return {
          type: "alt",
          exprs: [this.simplify(node.expr), pushNull],
        };
      // TODO: trailing separators is making this hang?
      case "sepBy0":
      case "sepBy1": {
        const expr = this.simplify(node.expr);
        const sep = this.simplify(node.separator);

        const seq: SimpleAST = {
          type: "seq",
          fn: cons,
          exprs: [
            expr,
            {
              type: "repeat0",
              expr: {
                type: "seq",
                fn: _2,
                exprs: [sep, expr],
              },
            },
            { type: "alt", exprs: [sep, pushNull] },
          ],
        };

        if (node.type === "sepBy0") {
          return { type: "alt", exprs: [seq, pushArr] };
        }
        return seq;
      }
      default:
        assertUnreachable(node);
    }
  }
}

class ScopeManager {
  private stack: Array<Map<string, symbol>> = [];
  public lookup(value: string): symbol {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const scope = this.stack[i];
      if (scope.has(value)) return scope.get(value)!;
    }
    throw new Error(`unknown identifier ${value}`);
  }
  public compileRuleset(
    rules: Array<{ name: string; expr: AST }>,
    addRule: (name: symbol, expr: AST) => void
  ): SimpleAST {
    if (!rules.length) {
      const nilRuleName = Symbol("nil");
      addRule(nilRuleName, pushNull as AST);
      return { type: "nonterminal", value: nilRuleName };
    }
    // build scope lookup
    const nextScope = new Map<string, symbol>();
    const mappedRules: Array<{ name: symbol; expr: AST }> = [];
    for (const { name, expr } of rules) {
      const symName = Symbol(name);
      nextScope.set(name, symName);
      mappedRules.push({ name: symName, expr });
    }

    // build rules in scope
    this.stack.push(nextScope);
    for (const { name, expr } of mappedRules) {
      addRule(name, expr);
    }
    this.stack.pop();

    // return first rule as identifier
    const firstRuleName = nextScope.get(rules[0].name)!;
    return { type: "nonterminal", value: firstRuleName };
  }
}

class LiteralManager {
  private keywords: Set<string> = new Set();
  private operators: Set<string> = new Set();
  private keywordRule = Symbol("keyword");
  private operatorRule = Symbol("operator");
  public add(literal: string): SimpleAST {
    if (literal.match(identifierPattern)) {
      this.keywords.add(literal);
    } else {
      this.operators.add(literal);
    }
    return { type: "literal", value: literal };
  }
  public terminal(node: AST & { type: "terminal" }): SimpleAST {
    switch (node.value) {
      case "keyword":
        return { type: "nonterminal", value: this.keywordRule };
      case "operator":
        return { type: "nonterminal", value: this.keywordRule };
      default:
        return { type: node.value };
    }
  }
  public compile(map: Map<symbol, SimpleAST>) {
    map.set(this.keywordRule, createAlts(this.keywords));
    map.set(this.operatorRule, createAlts(this.operators));
    return { keywords: this.keywords, operators: this.operators };
  }
}

function createAlts(lits: Set<string>): SimpleAST {
  return {
    type: "alt",
    exprs: Array.from(lits).map((value) => ({ type: "literal", value })),
  };
}

class FirstSetBuilder {
  cache = new Map<SimpleAST, Set<Terminal>>();
  constructor(private rules: Map<symbol, SimpleAST>) {}
  get(node: SimpleAST, recurSet: Set<symbol> = new Set()) {
    if (this.cache.has(node)) return this.cache.get(node)!;
    const res = this.getInner(node, recurSet);
    this.cache.set(node, res);
    return res;
  }
  private getInner(node: SimpleAST, recurSet: Set<symbol>) {
    switch (node.type) {
      case "literal":
        return new Set([brandLiteral(node.value)]);
      case "identifier":
        return new Set([brandType("identifier")]);
      case "value":
        return new Set([brandType("value")]);
      case "nonterminal": {
        if (recurSet.has(node.value)) {
          throw new Error(`left recursion on ${node.value.description}`);
        }
        const next = this.rules.get(node.value)!;
        return this.get(next, new Set([...recurSet, node.value]));
      }
      case "repeat0": {
        const innerSet = this.get(node.expr, recurSet);
        if (innerSet.has(brandEof)) {
          throw new Error(`repeat0 cannot match epsilon`);
        }
        return new Set([...innerSet, brandEof]);
      }
      case "seq": {
        const set = new Set([brandEof]);
        for (const expr of node.exprs) {
          set.delete(brandEof);
          for (const terminal of this.get(expr, recurSet)) {
            if (set.has(terminal)) {
              throw new Error(`first/follow conflict on ${terminal}`);
            }
            set.add(terminal);
          }
          if (!set.has(brandEof)) break;
        }
        return set;
      }
      case "alt": {
        const set = new Set();
        for (const expr of node.exprs) {
          for (const terminal of this.get(expr, recurSet)) {
            if (set.has(terminal)) {
              throw new Error(`first/first conflict on ${terminal}`);
            }
            set.add(terminal);
          }
        }
        return set;
      }
      default:
        assertUnreachable(node);
    }
  }
}

export class ParserCompiler {
  compiledRules = new Map<symbol, Parser<unknown>>();
  firstSet: FirstSetBuilder;
  constructor(ruleASTMap: Map<symbol, SimpleAST>) {
    this.firstSet = new FirstSetBuilder(ruleASTMap);
  }
  static compileRuleset(
    ruleASTMap: Map<symbol, SimpleAST>
  ): Map<symbol, Parser<unknown>> {
    const compiler = new ParserCompiler(ruleASTMap);
    for (const [name, node] of ruleASTMap) {
      compiler.compiledRules.set(name, compiler.compile(node));
    }
    return compiler.compiledRules;
  }
  compile(node: SimpleAST): Parser<unknown> {
    switch (node.type) {
      case "literal":
        return new MatchLiteral(node.value);
      case "identifier":
        return new MatchType("identifier");
      case "value":
        return new MatchType("value");
      case "nonterminal":
        return new MatchRule(this.compiledRules, node.value);
      case "repeat0":
        return new Repeat(
          this.compile(node.expr),
          new Set(this.firstSet.get(node.expr))
        );
      case "seq":
        this.firstSet.get(node);
        return new Seq(
          node.fn,
          node.exprs.map((expr) => this.compile(expr))
        );
      case "alt": {
        this.firstSet.get(node);
        const parserMap = new Map<Terminal, Parser<unknown>>();
        for (const expr of node.exprs) {
          for (const terminal of this.firstSet.get(expr)) {
            parserMap.set(terminal, this.compile(expr));
          }
        }
        return new Alt(parserMap);
      }
      default:
        assertUnreachable(node);
    }
  }
}

export function createParser(ast: AST) {
  const { startRule, rules, keywords, operators } = ASTSimplifier.simplifyAll(
    ast
  );
  const lexer = new Lexer(keywords, operators);
  const parserMap = ParserCompiler.compileRuleset(rules);
  const parser = parserMap.get(startRule)!;

  return (strs: readonly string[], ...xs: unknown[]) => {
    const tokens = lexer.run(strs, xs);
    return parser.parse(new ParseState(tokens));
  };
}
