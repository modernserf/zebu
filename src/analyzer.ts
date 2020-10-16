import { AST } from "./ast";
import { identifierPattern } from "./lexer";
import { assertUnreachable } from "./util";

type SeqFn = (...xs: unknown[]) => unknown;
export type SimpleAST = Map<symbol, SimpleASTNode>;

type SimpleASTNode =
  | { type: "nil" }
  | { type: "literal"; value: string }
  | { type: "terminal"; value: "identifier" | "value" }
  | { type: "identifier"; value: symbol }
  | { type: "repeat0"; expr: SimpleASTNode }
  | { type: "sepBy1"; expr: SimpleASTNode; separator: SimpleASTNode }
  | { type: "seq"; exprs: SimpleASTNode[]; fn: SeqFn }
  | { type: "alt"; exprs: SimpleASTNode[] };

type TerminalToReplace = {
  node: { type: "alt"; exprs: SimpleASTNode[] };
  terminalType: "keyword" | "operator";
};

class LiteralManager {
  keywords: Set<string> = new Set();
  operators: Set<string> = new Set();
  private terminalsToReplace: TerminalToReplace[] = [];
  public add(literal: string): SimpleASTNode {
    if (literal.match(identifierPattern)) {
      this.keywords.add(literal);
    } else {
      this.operators.add(literal);
    }
    return { type: "literal", value: literal };
  }
  public terminal(node: AST & { type: "terminal" }): SimpleASTNode {
    if (node.value === "keyword" || node.value === "operator") {
      const alt: SimpleASTNode = { type: "alt", exprs: [] };
      this.terminalsToReplace.push({ terminalType: node.value, node: alt });
      return alt;
    }
    return node as SimpleASTNode;
  }
  /**
   * replace matchers for "keyword" and "operator"-type tokens with
   * matchers for all possible literal values.
   */
  replaceTerminals() {
    const keywordExprs: SimpleASTNode[] = Array.from(this.keywords).map(
      (value) => ({
        type: "literal",
        value,
      })
    );

    const opExprs: SimpleASTNode[] = Array.from(this.operators).map(
      (value) => ({
        type: "literal",
        value,
      })
    );

    for (const term of this.terminalsToReplace) {
      if (term.terminalType === "keyword") {
        term.node.exprs = keywordExprs;
      } else {
        term.node.exprs = opExprs;
      }
    }
  }
}

class ScopeFlattener {
  flatScope: SimpleAST = new Map();
  private stack: Array<Map<string, symbol>> = [];
  resolveIdentifier(name: string): SimpleASTNode {
    for (const scope of this.stack) {
      if (scope.has(name)) {
        return { type: "identifier", value: scope.get(name)! };
      }
    }
    throw new Error(`unknown rule "${name}"`);
  }
  createScope(
    rules: Array<{ name: string; expr: AST }>,
    analyze: (node: AST) => SimpleASTNode
  ): SimpleASTNode {
    const nextScope = new Map<string, symbol>();
    for (const { name } of rules) {
      nextScope.set(name, Symbol(name));
    }

    this.stack.unshift(nextScope);

    for (const { name, expr } of rules) {
      this.flatScope.set(nextScope.get(name)!, analyze(expr));
    }

    this.stack.shift();

    return this.flatScope.get(nextScope.get(rules[0].name)!)!;
  }
}

// export class LivenessChecker {
//   private queue: symbol[] = [];
//   private constructor(private readonly ast: SimpleAST) {}
//   static check(root: symbol, ast: SimpleAST): void {
//     new LivenessChecker(ast).checkAll(root);
//   }
//   private checkAll(root: symbol): void {
//     this.queue.push(root);
//     const checked = new Set<symbol>();
//     while (this.queue.length) {
//       const sym = this.queue.shift()!;
//       if (checked.has(sym)) continue;
//       checked.add(sym);
//       this.check(this.ast.get(sym)!);
//     }
//     for (const key of this.ast.keys()) {
//       if (!checked.has(key)) {
//         throw new Error(
//           `rule ${String(key)} not reachable from ${String(root)}`
//         );
//       }
//     }
//   }
//   private check(node: SimpleASTNode): void {
//     switch (node.type) {
//       case "nil":
//       case "terminal":
//       case "literal":
//         return;
//       case "identifier":
//         this.queue.push(node.value);
//         return;
//       case "repeat0":
//         this.check(node.expr);
//         return;
//       case "sepBy1":
//         this.check(node.expr);
//         this.check(node.separator);
//         return;
//       case "alt":
//       case "seq":
//         for (const expr of node.exprs) {
//           this.check(expr);
//         }
//         return;
//       default:
//         assertUnreachable(node);
//     }
//   }
// }

class NilChecker {
  private checkedNodes: Map<SimpleASTNode, boolean> = new Map();
  private uncheckedNodes: Set<SimpleASTNode> = new Set();
  private ast: SimpleAST = new Map();
  queue(node: SimpleASTNode) {
    this.uncheckedNodes.add(node);
    return node;
  }
  checkAll(ast: SimpleAST): void {
    this.ast = ast;
    for (const node of this.uncheckedNodes) {
      if (!this.check(node)) {
        throw new Error("this node cannot yield nil");
      }
    }
  }
  private check(node: SimpleASTNode): boolean {
    if (this.checkedNodes.has(node)) return this.checkedNodes.get(node)!;
    switch (node.type) {
      case "nil":
      case "repeat0":
        this.checkedNodes.set(node, false);
        return false;
      case "literal":
      case "terminal":
      case "sepBy1":
        this.checkedNodes.set(node, true);
        return true;
      case "alt":
        for (const expr of node.exprs) {
          this.check(expr);
        }
        this.checkedNodes.set(node, true);
        return true;
      case "seq":
        for (const expr of node.exprs) {
          if (this.check(expr)) {
            this.checkedNodes.set(node, true);
            return true;
          }
        }
        this.checkedNodes.set(node, false);
        return false;
      case "identifier":
        this.check(this.ast.get(node.value)!);
        this.checkedNodes.set(node, true);
        return true;
      default:
        // istanbul ignore next
        assertUnreachable(node);
    }
  }
}

const _1 = (x) => x;
const _2 = (_, x) => x;
const cons = (x, xs) => [x, ...xs];

export class TreeAnalyzer {
  private cache: Map<AST, SimpleASTNode> = new Map();
  private literals = new LiteralManager();
  private scope = new ScopeFlattener();
  private nilChecker = new NilChecker();
  static analyze(
    root: AST
  ): { keywords: Set<string>; operators: Set<string>; ast: SimpleAST } {
    const analyzer = new TreeAnalyzer();
    const analyzedRoot = analyzer.analyze(root);
    analyzer.literals.replaceTerminals();
    const ast = analyzer.scope.flatScope;
    if (root.type !== "ruleset") {
      const key = Symbol("root");
      ast.set(key, analyzedRoot);
      // LivenessChecker.check(key, ast);
    } else {
      // const [key] = Array.from(ast.entries()).find(
      //   ([_, value]) => value === analyzedRoot
      // )!;
      // LivenessChecker.check(key, ast);
    }
    analyzer.nilChecker.checkAll(ast);
    return {
      keywords: analyzer.literals.keywords,
      operators: analyzer.literals.operators,
      ast: ast,
    };
  }

  private analyze(node: AST): SimpleASTNode {
    if (this.cache.has(node)) return this.cache.get(node)!;

    switch (node.type) {
      case "error":
        throw new Error(node.message);
      case "nil":
        return node;
      case "terminal":
        return this.literals.terminal(node);
      case "identifier":
        return this.scope.resolveIdentifier(node.value);
      case "literal":
        return this.literals.add(node.value);
      case "structure":
        return {
          type: "seq",
          fn: _2,
          exprs: [
            this.literals.add(node.startToken),
            this.analyze(node.expr),
            this.literals.add(node.endToken),
          ],
        };
      case "seq":
        return {
          type: "seq",
          fn: node.fn || _1,
          exprs: node.exprs.map((expr) => this.analyze(expr)),
        };
      case "alt":
        return {
          type: "alt",
          exprs: node.exprs.map((expr) => this.analyze(expr)),
        };
      case "repeat0":
        return {
          type: "repeat0",
          expr: this.nilChecker.queue(this.analyze(node.expr)),
        };
      case "repeat1": {
        const expr = this.nilChecker.queue(this.analyze(node.expr));
        return {
          type: "seq",
          fn: cons,
          exprs: [expr, { type: "repeat0", expr }],
        };
      }
      case "maybe":
        return {
          type: "alt",
          exprs: [
            { type: "nil" },
            this.nilChecker.queue(this.analyze(node.expr)),
          ],
        };
      case "sepBy0":
      case "sepBy1": {
        const result: SimpleASTNode = {
          type: "sepBy1",
          expr: this.nilChecker.queue(this.analyze(node.expr)),
          separator: this.nilChecker.queue(this.analyze(node.separator)),
        };
        if (node.type === "sepBy1") return result;
        return { type: "alt", exprs: [{ type: "nil" }, result] };
      }
      case "ruleset": {
        return this.scope.createScope(node.rules, (expr) => this.analyze(expr));
      }
      default:
        // istanbul ignore next
        assertUnreachable(node);
    }
  }
}
