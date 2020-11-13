import { AST, checkLit, builders } from './core';
import {
  lang,
  ZebuLanguageReturning,
  ZebuLanguage,
  createLanguage,
} from './lang';
import { assertUnreachable } from './util';
const { alt, seq, ident } = builders;

type Fixity = 'left' | 'right' | 'pre' | 'post';
type SeqFn = (...xs: unknown[]) => unknown;
type OpExpr = { pattern: string[]; fn: SeqFn };
type Rule = { fixity: Fixity; operators: OpExpr[] };

export const op = lang`
  Program   = Rule* RootRule? : 
    ${(rules, root) => createLanguage(buildAST(rules, root))};
  Rule      = Fixity Expr+ : 
    ${(fixity: Fixity, operators: OpExpr[]): Rule => ({ fixity, operators })};
  Expr      = Pattern ":" value : 
    ${(pattern: string[], _, fn: SeqFn): OpExpr => ({ pattern, fn })};
  Pattern   = value+;
  RootRule  = "root" identifier : ${(_: unknown, x: unknown) => x};
  Fixity    = "left" | "right" | "pre" | "post";
` as ZebuLanguageReturning<ZebuLanguage>;

export function buildAST(rules: Rule[], rootExpr: string): AST {
  const ruleset: AST = { type: 'ruleset', rules: [] };
  let next = ident('0');
  for (const [i, rule] of rules.entries()) {
    const self = ident(String(i));
    next = ident(String(i + 1));
    // eslint-disable-next-line no-loop-func
    const push = (fn: any, ...exprs: AST[]) =>
      ruleset.rules.push({
        name: String(i),
        expr: alt(seq(fn, ...exprs), next),
      });
    const opAlts = alt(
      ...rule.operators.map(({ pattern, fn }) =>
        seq(() => fn, ...pattern.map(checkLit))
      )
    );

    switch (rule.fixity) {
      case 'left':
        push((l, op, r) => op(l, r), self, opAlts, next);
        break;
      case 'right':
        push((l, op, r) => op(l, r), next, opAlts, self);
        break;
      case 'pre':
        push((op, r) => op(r), opAlts, self);
        break;
      case 'post':
        push((l, op) => op(l), self, opAlts);
        break;
      // istanbul ignore next
      default:
        assertUnreachable(rule.fixity);
    }
  }

  const rootASTNode: AST = rootExpr
    ? ident(rootExpr)
    : builders.terminal('value');

  ruleset.rules.push({
    name: (next as AST & { type: 'terminal' }).value,
    expr: alt(builders.structure('(', ident('0'), ')'), rootASTNode),
  });

  return ruleset;
}
