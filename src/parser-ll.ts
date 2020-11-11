import { AST } from './core';
import { Lexer } from './lexer';
import {
  Alt,
  MatchLiteral,
  MatchRule,
  MatchType,
  Parser,
  Reduce,
  Seq,
  ParseState,
  InternalParseError,
  brandEof,
  brandLiteral,
  brandType,
  Terminal,
} from './parser-combinators';
import {
  assertUnreachable,
  ParseError,
  CompileError,
  intersection,
  union,
} from './util';
import { SimpleAST, SimpleASTAlt, ASTSimplifier } from './simplifier';

class FirstSetBuilder {
  cache = new Map<SimpleAST, Set<Terminal>>();
  constructor(private rules: Map<symbol, SimpleAST>) {}
  get(node: SimpleAST, recurSet: Set<symbol> = new Set()) {
    if (this.cache.has(node)) return this.cache.get(node)!;
    const res = this.getInner(node, recurSet);
    this.cache.set(node, res);
    return res;
  }
  private getInner(node: SimpleAST, recurSet: Set<symbol>): Set<Terminal> {
    switch (node.type) {
      case 'reduce':
        return new Set([brandEof]);
      case 'literal':
        return new Set([brandLiteral(node.value)]);
      case 'identifier':
        return new Set([brandType('identifier')]);
      case 'value':
        return new Set([brandType('value')]);
      case 'nonterminal': {
        if (recurSet.has(node.value)) {
          throw new CompileError(`left recursion on ${node.value.description}`);
        }
        const next = this.rules.get(node.value)!;
        return this.get(next, new Set([...recurSet, node.value]));
      }
      case 'seq': {
        let set = new Set([brandEof]);
        for (const expr of node.exprs) {
          set.delete(brandEof);
          set = union(set, this.get(expr, recurSet));
          if (!set.has(brandEof)) break;
        }
        return set;
      }
      case 'alt': {
        const set: Set<Terminal> = new Set();
        for (const expr of node.exprs) {
          for (const terminal of this.get(expr, recurSet)) {
            if (set.has(terminal)) {
              throw new CompileError(`first/first conflict on ${terminal}`);
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
    checkFollowSets(ruleASTMap, compiler.firstSet);
    return compiler.compiledRules;
  }
  compile(node: SimpleAST): Parser {
    switch (node.type) {
      case 'reduce':
        return new Reduce(node.arity, node.fn);
      case 'literal':
        return new MatchLiteral(node.value);
      case 'identifier':
        return new MatchType('identifier');
      case 'value':
        return new MatchType('value');
      case 'nonterminal':
        return new MatchRule(this.compiledRules, node.value);
      case 'seq':
        this.firstSet.get(node);
        return new Seq(node.exprs.map(expr => this.compile(expr)));
      case 'alt': {
        if (node.exprs.length === 1) return this.compile(node.exprs[0]);

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

// TODO: this catches `Rule = Foo? Foo` but not `Rule = Foo* Foo`
function checkFollowSets(
  ruleMap: Map<symbol, SimpleASTAlt>,
  firstSet: FirstSetBuilder
) {
  for (const rule of ruleMap.values()) {
    for (const branch of rule.exprs) {
      let workingSet = new Set<Terminal>();
      for (const expr of branch.exprs) {
        const exprSet = firstSet.get(expr);

        if (workingSet.has(brandEof)) {
          workingSet.delete(brandEof);
          const conflicts = intersection(workingSet, exprSet);
          if (conflicts.size) {
            throw new CompileError(
              `first/follow conflict on ${[...conflicts].join()}`
            );
          }
          workingSet = union(workingSet, exprSet);
        } else {
          workingSet = exprSet;
        }
      }
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
    try {
      parser.parse(parseState);
      return parseState.done() as T;
    } catch (e) {
      // istanbul ignore else
      if (e instanceof InternalParseError) {
        throw new ParseError(e.message, strs, e.pos);
      } else {
        throw e;
      }
    }
  };
}
