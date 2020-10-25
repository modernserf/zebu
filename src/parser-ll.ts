import { AST } from "./core";
import { identifierPattern, Lexer } from "./lexer";
import {
  Alt,
  MatchLiteral,
  MatchRule,
  MatchType,
  Parser,
  Reduce,
  Seq,
  ParseState,
} from "./parser-combinators";
import { resolveConflicts } from "./resolve-conflicts";
import { assertUnreachable } from "./util";

type Brand<K, T> = K & { __brand: T };
export type Terminal = Brand<string, "Terminal">;
export const brandLiteral = (value: string) => `"${value}"` as Terminal;
export const brandType = (type: string) => `<${type}>` as Terminal;
export const brandEof = "(end of input)" as Terminal;

export type SimpleASTAlt = { type: "alt"; exprs: Array<SimpleASTSeq> };
export type SimpleASTSeq = { type: "seq"; exprs: SimpleASTNode[] };

type SeqFn = (...xs: unknown[]) => unknown;
export type SimpleASTNode =
  | { type: "literal"; value: string }
  | { type: "identifier" }
  | { type: "value" }
  | { type: "nonterminal"; value: symbol }
  | { type: "reduce"; arity: number; fn: SeqFn | null };

export type SimpleAST = SimpleASTNode | SimpleASTSeq | SimpleASTAlt;

const _2 = (_, x) => x;
const cons = (h, t: unknown[]) => [h, ...t];
const pushNull: SimpleASTSeq = {
  type: "seq",
  exprs: [{ type: "reduce", arity: 0, fn: () => null }],
};
const pushArr: SimpleASTSeq = {
  type: "seq",
  exprs: [{ type: "reduce", arity: 0, fn: () => [] }],
};

export class ASTSimplifier {
  rules = new Map<symbol, SimpleASTAlt>();
  scope = new ScopeManager();
  literals = new LiteralManager();
  static simplifyAll(node: AST) {
    return new ASTSimplifier().simplifyAll(node);
  }
  private simplifyAll(node: AST) {
    const startRule = Symbol("start");
    this.rules.set(startRule, this.simplifyAlt(node));
    resolveConflicts(this.rules, startRule);

    const { keywords, operators } = this.literals.compile(this.rules);
    return {
      startRule,
      rules: this.rules,
      keywords,
      operators,
    };
  }
  private simplifyAlt(node: AST): SimpleASTAlt {
    switch (node.type) {
      case "alt":
        return {
          type: "alt",
          exprs: node.exprs.map((expr) => this.simplifySeq(expr)),
        };
      case "maybe":
        return {
          type: "alt",
          exprs: [this.simplifySeq(node.expr), pushNull],
        };
      case "sepBy0":
        return {
          type: "alt",
          exprs: [
            {
              type: "seq",
              exprs: [
                this.simplifyNode({
                  type: "sepBy1",
                  expr: node.expr,
                  separator: node.separator,
                }),
              ],
            },
            pushArr,
          ],
        };
      default:
        return { type: "alt", exprs: [this.simplifySeq(node)] };
    }
  }
  private simplifySeq(node: AST): SimpleASTSeq {
    switch (node.type) {
      case "structure":
        return {
          type: "seq",
          exprs: [
            this.literals.add(node.startToken),
            this.simplifyNode(node.expr),
            this.literals.add(node.endToken),
            { type: "reduce", arity: 3, fn: _2 },
          ],
        };
      case "seq":
        return {
          type: "seq",
          exprs: node.exprs
            .map((expr) => this.simplifyNode(expr))
            .concat([
              { type: "reduce", arity: node.exprs.length, fn: node.fn },
            ]),
        };
      case "repeat1":
        return {
          type: "seq",
          exprs: [
            this.simplifyNode(node.expr),
            this.simplifyNode({ type: "repeat0", expr: node.expr }),
            { type: "reduce", arity: 2, fn: cons },
          ],
        };
      default:
        return { type: "seq", exprs: [this.simplifyNode(node)] };
    }
  }
  private simplifyNode(node: AST): SimpleASTNode {
    switch (node.type) {
      case "error":
        throw new Error(node.message);
      case "repeat1":
      case "structure":
      case "seq":
      case "alt":
      case "sepBy0":
      case "maybe": {
        const ruleName = Symbol();
        this.rules.set(ruleName, this.simplifyAlt(node));
        return { type: "nonterminal", value: ruleName };
      }
      case "ruleset":
        return this.scope.compileRuleset(node.rules, (name, expr) => {
          this.rules.set(name, this.simplifyAlt(expr));
        });
      case "literal":
        return this.literals.add(node.value);
      case "terminal":
        return this.literals.terminal(node);
      case "identifier":
        return { type: "nonterminal", value: this.scope.lookup(node.value) };
      case "repeat0": {
        // A = Expr* ---> A = Expr A | nil
        const recur: SimpleASTNode = { type: "nonterminal", value: Symbol() };
        this.rules.set(recur.value, {
          type: "alt",
          exprs: [
            {
              type: "seq",
              exprs: [
                this.simplifyNode(node.expr),
                recur,
                { type: "reduce", arity: 2, fn: cons },
              ],
            },
            pushArr,
          ],
        });
        return recur;
      }
      case "sepBy1": {
        // A = Expr (Sep Expr)* Sep?
        // --->
        // A = Expr B
        // B = Sep C | nil
        // C = A | nil
        const A: SimpleASTNode = { type: "nonterminal", value: Symbol() };
        const B: SimpleASTNode = { type: "nonterminal", value: Symbol() };
        const C: SimpleASTNode = { type: "nonterminal", value: Symbol() };
        const expr = this.simplifyNode(node.expr);
        const sep = this.simplifyNode(node.separator);

        this.rules.set(A.value, {
          type: "alt",
          exprs: [
            {
              type: "seq",
              exprs: [expr, B, { type: "reduce", arity: 2, fn: cons }],
            },
          ],
        });
        this.rules.set(B.value, {
          type: "alt",
          exprs: [
            {
              type: "seq",
              exprs: [sep, C, { type: "reduce", arity: 2, fn: _2 }],
            },
            pushArr,
          ],
        });
        this.rules.set(C.value, {
          type: "alt",
          exprs: [{ type: "seq", exprs: [A] }, pushArr],
        });

        return A;
      }
      // istanbul ignore next
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
  ): SimpleASTNode {
    // istanbul ignore next
    if (!rules.length) {
      throw new Error("should be unreachable");
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
  public add(literal: string): SimpleASTNode {
    if (literal.match(identifierPattern)) {
      this.keywords.add(literal);
    } else {
      this.operators.add(literal);
    }
    return { type: "literal", value: literal };
  }
  public terminal(node: AST & { type: "terminal" }): SimpleASTNode {
    switch (node.value) {
      case "keyword":
        return { type: "nonterminal", value: this.keywordRule };
      case "operator":
        return { type: "nonterminal", value: this.operatorRule };
      default:
        return { type: node.value };
    }
  }
  public compile(map: Map<symbol, SimpleASTAlt>) {
    map.set(this.keywordRule, createAlts(this.keywords));
    map.set(this.operatorRule, createAlts(this.operators));
    return { keywords: this.keywords, operators: this.operators };
  }
}

function createAlts(lits: Set<string>): SimpleASTAlt {
  return {
    type: "alt",
    exprs: Array.from(lits).map((value) => ({
      type: "seq",
      exprs: [{ type: "literal", value }],
    })),
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
      case "reduce":
        return new Set([brandEof]);
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
      // istanbul ignore next
      default:
        assertUnreachable(node);
    }
  }
}

export class ParserCompiler {
  compiledRules = new Map<symbol, Parser>();
  firstSet: FirstSetBuilder;
  constructor(ruleASTMap: Map<symbol, SimpleASTAlt>) {
    this.firstSet = new FirstSetBuilder(ruleASTMap);
  }
  static compileRuleset(
    ruleASTMap: Map<symbol, SimpleASTAlt>
  ): Map<symbol, Parser> {
    const compiler = new ParserCompiler(ruleASTMap);
    for (const [name, node] of ruleASTMap) {
      compiler.compiledRules.set(name, compiler.compile(node));
    }
    return compiler.compiledRules;
  }
  compile(node: SimpleAST): Parser {
    switch (node.type) {
      case "reduce":
        return new Reduce(node.arity, node.fn);
      case "literal":
        return new MatchLiteral(node.value);
      case "identifier":
        return new MatchType("identifier");
      case "value":
        return new MatchType("value");
      case "nonterminal":
        return new MatchRule(this.compiledRules, node.value);
      case "seq":
        this.firstSet.get(node);
        return new Seq(node.exprs.map((expr) => this.compile(expr)));
      case "alt": {
        this.firstSet.get(node);
        const parserMap = new Map<Terminal, Parser>();
        for (const expr of node.exprs) {
          for (const terminal of this.firstSet.get(expr)) {
            parserMap.set(terminal, this.compile(expr));
          }
        }
        return new Alt(parserMap);
      }
      // istanbul ignore next
      default:
        assertUnreachable(node);
    }
  }
}

export function createParser<T>(ast: AST) {
  const { startRule, rules, keywords, operators } = ASTSimplifier.simplifyAll(
    ast
  );
  const lexer = new Lexer(keywords, operators);
  const parserMap = ParserCompiler.compileRuleset(rules);
  const parser = parserMap.get(startRule)!;

  return (strs: readonly string[], ...xs: unknown[]): T => {
    const tokens = lexer.run(strs, xs);
    const parseState = new ParseState(tokens);
    parser.parse(parseState);
    return parseState.done() as T;
  };
}
