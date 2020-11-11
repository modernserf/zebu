import { AST } from './core';
import { identifierPattern } from './lexer';
import { assertUnreachable, CompileError, partition } from './util';

export type SimpleASTAlt = { type: 'alt'; exprs: Array<SimpleASTSeq> };
export type SimpleASTSeq = { type: 'seq'; exprs: SimpleASTNode[] };

type SeqFn = (...xs: unknown[]) => unknown;
export type SimpleASTNode =
  | { type: 'literal'; value: string }
  | { type: 'identifier' }
  | { type: 'value' }
  | { type: 'nonterminal'; value: symbol }
  | { type: 'reduce'; arity: number; fn: SeqFn | null };

export type SimpleAST = SimpleASTNode | SimpleASTSeq | SimpleASTAlt;

const _2 = (_, x) => x;
const cons = (h, t: unknown[]) => [h, ...t];
const pushNull: SimpleASTSeq = {
  type: 'seq',
  exprs: [{ type: 'reduce', arity: 0, fn: () => null }],
};
const pushArr: SimpleASTSeq = {
  type: 'seq',
  exprs: [{ type: 'reduce', arity: 0, fn: () => [] }],
};

/**
 * factor out direct left recursion, using the algorithm:
 * ```
 * A  = A "+" B | B
 *    -->
 * A  = B A_
 * A_ = "+" B A_ | nil
 * ```
 */
export function fixLeftRecursion(rules: Map<symbol, SimpleASTAlt>): void {
  for (const [ruleName, rule] of rules) {
    const [leftRecursiveBranches, safeBranches] = partition(
      rule.exprs,
      expr => {
        const node = expr.exprs[0];
        return node && node.type === 'nonterminal' && node.value === ruleName;
      }
    );
    if (leftRecursiveBranches.length > 0) {
      const newRule = Symbol();
      // make a self-recursive rule here (instead of using * repeater)
      // so that you don't have to transform the reduce fns
      rules.set(newRule, {
        type: 'alt',
        exprs: leftRecursiveBranches
          .map(
            (seq): SimpleASTSeq => ({
              type: 'seq',
              exprs: seq.exprs
                .slice(1)
                .concat([{ type: 'nonterminal', value: newRule }]),
            })
          )
          .concat({ type: 'seq', exprs: [] }),
      });
      rules.set(ruleName, {
        type: 'alt',
        exprs: safeBranches.map(seq => ({
          type: 'seq',
          exprs: seq.exprs.concat([{ type: 'nonterminal', value: newRule }]),
        })),
      });
    }
  }
}

/**
 * factor out shared left prefixes, using the algorithm:
 * ```
 * A  = a X | a Y
 *    -->
 * A  = a A_
 * A_ = X | Y
 * ```
 */
export function factorLeft(rules: Map<symbol, SimpleASTAlt>): void {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const toRewrite: Array<[
      symbol,
      Map<SimpleASTNode | null, SimpleASTAlt>
    ]> = [];
    for (const [ruleName, rule] of rules) {
      const byPrefix = groupByPrefix(rule);
      if (byPrefix) {
        toRewrite.push([ruleName, byPrefix]);
      }
    }
    if (toRewrite.length === 0) return;

    for (const [ruleName, byPrefix] of toRewrite) {
      const updatedRule: SimpleASTAlt = { type: 'alt', exprs: [] };
      for (const [prefix, rest] of byPrefix) {
        if (
          rest.exprs.length > 0 &&
          rest.exprs.some(expr => expr.exprs.length > 0)
        ) {
          const key = Symbol();
          rules.set(key, rest);
          updatedRule.exprs.push({
            type: 'seq',
            exprs: [prefix, { type: 'nonterminal', value: key }].filter(
              Boolean
            ) as SimpleASTNode[],
          });
        } else {
          updatedRule.exprs.push({
            type: 'seq',
            exprs: [prefix].filter(Boolean) as SimpleASTNode[],
          });
        }
      }
      rules.set(ruleName, updatedRule);
    }
  }
}

// a X | a Y | b -> { a -> X | Y, b -> nil }
function groupByPrefix(
  rule: SimpleASTAlt
): Map<SimpleASTNode | null, SimpleASTAlt> | null {
  const map = new Map<SimpleASTNode | null, SimpleASTAlt>();
  let needsFactoring = false;
  for (const expr of rule.exprs) {
    const [prefix, ...rest] = expr.exprs;
    let found = false;
    for (const [key, alt] of map) {
      if (isEqual(prefix, key)) {
        alt.exprs.push({ type: 'seq', exprs: rest });
        needsFactoring = true;
        found = true;
        break;
      }
    }
    if (!found) {
      map.set(prefix || null, {
        type: 'alt',
        exprs: [{ type: 'seq', exprs: rest }],
      });
    }
  }

  if (needsFactoring) return map;
  return null;
}

// TODO: coverage?
// istanbul ignore next
function isEqual(l: SimpleASTNode | null, rIn: SimpleASTNode | null) {
  if (l === rIn) return true;
  if (!l || !rIn) return false;
  if (l.type !== rIn.type) return false;
  const r = rIn as any; // :(
  switch (l.type) {
    case 'identifier':
    case 'value':
      return true;
    case 'literal':
      return l.value === r.value;
    case 'nonterminal':
      return l.value === r.value;
    case 'reduce':
      return l.arity === r.arity && l.fn === r.fn;
    // istanbul ignore next
    default:
      assertUnreachable(l);
  }
}

/**
 * Flatten nested grammars into a single grammar, using the rules of lexical scope, and replacing string identifiers with symbols.
 */
class ScopeManager {
  private stack: Array<Map<string, symbol>> = [];
  public lookup(value: string): symbol {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const scope = this.stack[i];
      if (scope.has(value)) return scope.get(value)!;
    }
    throw new CompileError(`unknown identifier ${value}`);
  }
  public compileRuleset(
    rules: Array<{ name: string; expr: AST }>,
    addRule: (name: symbol, expr: AST) => void
  ): SimpleASTNode {
    // istanbul ignore next
    if (!rules.length) {
      throw new CompileError('should be unreachable');
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
    return { type: 'nonterminal', value: firstRuleName };
  }
}

/**
 * Track the literals used in the grammar so they can be correctly tokenized by the lexer, and convert references to the 'keyword' and 'operator' token with rules that match all keywords or operators.
 */
class LiteralManager {
  private keywords: Set<string> = new Set();
  private operators: Set<string> = new Set();
  private keywordRule = Symbol('keyword');
  private operatorRule = Symbol('operator');
  private usedKeywordRule = false;
  private usedOperatorRule = false;
  public add(literal: string): SimpleASTNode {
    if (literal.match(identifierPattern)) {
      this.keywords.add(literal);
    } else {
      this.operators.add(literal);
    }
    return { type: 'literal', value: literal };
  }
  public terminal(node: AST & { type: 'terminal' }): SimpleASTNode {
    switch (node.value) {
      case 'keyword':
        this.usedKeywordRule = true;
        return { type: 'nonterminal', value: this.keywordRule };
      case 'operator':
        this.usedOperatorRule = true;
        return { type: 'nonterminal', value: this.operatorRule };
      default:
        return { type: node.value };
    }
  }
  public compile(map: Map<symbol, SimpleASTAlt>) {
    if (this.usedKeywordRule) {
      map.set(this.keywordRule, createAlts(this.keywords));
    }
    if (this.usedOperatorRule) {
      map.set(this.operatorRule, createAlts(this.operators));
    }
    return { keywords: this.keywords, operators: this.operators };
  }
}

function createAlts(lits: Set<string>): SimpleASTAlt {
  return {
    type: 'alt',
    exprs: Array.from(lits).map(value => ({
      type: 'seq',
      exprs: [{ type: 'literal', value }],
    })),
  };
}

/**
 * Transform a Zebu AST into a flat grammar, using only alternation, sequence, and recursion.
 */
export class ASTSimplifier {
  rules = new Map<symbol, SimpleASTAlt>();
  scope = new ScopeManager();
  literals = new LiteralManager();
  static simplifyAll(node: AST) {
    return new ASTSimplifier().simplifyAll(node);
  }
  private simplifyAll(node: AST) {
    const startRule = Symbol('start');
    this.rules.set(startRule, this.simplifyAlt(node));
    fixLeftRecursion(this.rules);
    factorLeft(this.rules);

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
      case 'alt':
        return {
          type: 'alt',
          exprs: node.exprs.map(expr => this.simplifySeq(expr)),
        };
      case 'maybe':
        return {
          type: 'alt',
          exprs: [this.simplifySeq(node.expr), pushNull],
        };
      case 'sepBy0':
        return {
          type: 'alt',
          exprs: [
            {
              type: 'seq',
              exprs: [
                this.simplifyNode({
                  type: 'sepBy1',
                  expr: node.expr,
                  separator: node.separator,
                }),
              ],
            },
            pushArr,
          ],
        };
      default:
        return { type: 'alt', exprs: [this.simplifySeq(node)] };
    }
  }
  private simplifySeq(node: AST): SimpleASTSeq {
    switch (node.type) {
      case 'structure':
        return {
          type: 'seq',
          exprs: [
            this.literals.add(node.startToken),
            this.simplifyNode(node.expr),
            this.literals.add(node.endToken),
            { type: 'reduce', arity: 3, fn: _2 },
          ],
        };
      case 'seq':
        return {
          type: 'seq',
          exprs: node.exprs
            .map(expr => this.simplifyNode(expr))
            .concat([
              { type: 'reduce', arity: node.exprs.length, fn: node.fn },
            ]),
        };
      case 'repeat1':
        return {
          type: 'seq',
          exprs: [
            this.simplifyNode(node.expr),
            this.simplifyNode({ type: 'repeat0', expr: node.expr }),
            { type: 'reduce', arity: 2, fn: cons },
          ],
        };
      default:
        return { type: 'seq', exprs: [this.simplifyNode(node)] };
    }
  }
  private simplifyNode(node: AST): SimpleASTNode {
    switch (node.type) {
      case 'error':
        throw new CompileError(node.message);
      case 'repeat1':
      case 'structure':
      case 'seq':
      case 'alt':
      case 'sepBy0':
      case 'maybe': {
        const ruleName = Symbol();
        this.rules.set(ruleName, this.simplifyAlt(node));
        return { type: 'nonterminal', value: ruleName };
      }
      case 'ruleset':
        return this.scope.compileRuleset(node.rules, (name, expr) => {
          this.rules.set(name, this.simplifyAlt(expr));
        });
      case 'literal':
        return this.literals.add(node.value);
      case 'terminal':
        return this.literals.terminal(node);
      case 'identifier':
        return { type: 'nonterminal', value: this.scope.lookup(node.value) };
      case 'repeat0': {
        // A = Expr* ---> A = Expr A | nil
        const recur: SimpleASTNode = {
          type: 'nonterminal',
          value: Symbol('Repeat'),
        };
        this.rules.set(recur.value, {
          type: 'alt',
          exprs: [
            {
              type: 'seq',
              exprs: [
                this.simplifyNode(node.expr),
                recur,
                { type: 'reduce', arity: 2, fn: cons },
              ],
            },
            pushArr,
          ],
        });
        return recur;
      }
      case 'sepBy1': {
        // A = Expr (Sep Expr)* Sep?
        // --->
        // A = Expr B
        // B = Sep C | nil
        // C = A | nil
        const A: SimpleASTNode = { type: 'nonterminal', value: Symbol() };
        const B: SimpleASTNode = { type: 'nonterminal', value: Symbol() };
        const C: SimpleASTNode = { type: 'nonterminal', value: Symbol() };
        const expr = this.simplifyNode(node.expr);
        const sep = this.simplifyNode(node.separator);

        this.rules.set(A.value, {
          type: 'alt',
          exprs: [
            {
              type: 'seq',
              exprs: [expr, B, { type: 'reduce', arity: 2, fn: cons }],
            },
          ],
        });
        this.rules.set(B.value, {
          type: 'alt',
          exprs: [
            {
              type: 'seq',
              exprs: [sep, C, { type: 'reduce', arity: 2, fn: _2 }],
            },
            pushArr,
          ],
        });
        this.rules.set(C.value, {
          type: 'alt',
          exprs: [{ type: 'seq', exprs: [A] }, pushArr],
        });

        return A;
      }
      // istanbul ignore next
      default:
        assertUnreachable(node);
    }
  }
}
