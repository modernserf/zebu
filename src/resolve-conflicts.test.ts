import { SimpleASTAlt, SimpleASTNode, SimpleASTSeq } from './parser-ll';
import { factorLeft, fixLeftRecursion, inlineRules } from './resolve-conflicts';

const alt = (...exprs: SimpleASTSeq[]): SimpleASTAlt => ({
  type: 'alt',
  exprs,
});
const seq = (...exprs: SimpleASTNode[]): SimpleASTSeq => ({
  type: 'seq',
  exprs,
});
const nt = (value: symbol): SimpleASTNode => ({ type: 'nonterminal', value });
const lit = (value: string): SimpleASTNode => ({ type: 'literal', value });

test('inlineRules', () => {
  const root = Symbol('root');
  const A = Symbol('A');
  const B = Symbol('B');
  const rules = new Map([
    [root, alt(seq(lit('x'), nt(A)), seq(nt(B), lit('y')))],
    [A, alt(seq(lit('a')))],
    [B, alt(seq(lit('b')))],
  ]);
  inlineRules(rules, root);
  expect(rules).toEqual(
    new Map([
      [root, alt(seq(lit('x'), lit('a')), seq(lit('b'), lit('y')))],
      [A, alt(seq(lit('a')))],
      [B, alt(seq(lit('b')))],
    ])
  );
});

test('factorLeft', () => {
  const root = Symbol('root');
  const rules = new Map([
    [
      root,
      alt(
        seq(lit('x'), lit('a')),
        seq(lit('x'), lit('b')),
        seq(lit('x')),
        seq(lit('c'))
      ),
    ],
  ]);
  factorLeft(rules);
  const next = (rules.get(root)!.exprs[0].exprs[1] as SimpleASTNode & {
    type: 'nonterminal';
  }).value;
  expect(rules).toEqual(
    new Map([
      [root, alt(seq(lit('x'), nt(next)), seq(lit('c')))],
      [next, alt(seq(lit('a')), seq(lit('b')), seq())],
    ])
  );
});

test('fixLeftRecursion', () => {
  const Expr = Symbol('Expr');
  const Factor = Symbol('Factor');
  const Term = Symbol('Term');
  // prettier-ignore
  const rules = new Map([
    [Expr, alt(
      seq(nt(Expr), lit('+'), nt(Factor)),
      seq(nt(Expr), lit('-'), nt(Factor)),
      seq(nt(Factor))
    )],
    [Factor, alt(
      seq(nt(Factor), lit('*'), nt(Term)),
      seq(nt(Factor), lit('/'), nt(Term)),
      seq(nt(Term))
    )],
    [Term, alt(
      seq(lit('('), nt(Expr), lit(')')),
      seq({ type: "value" })
    )]
  ]);
  fixLeftRecursion(rules);
  const ExprNext = (rules.get(Expr)!.exprs[0].exprs[1] as SimpleASTNode & {
    type: 'nonterminal';
  }).value;
  const FactorNext = (rules.get(Factor)!.exprs[0].exprs[1] as SimpleASTNode & {
    type: 'nonterminal';
  }).value;
  // prettier-ignore
  expect(rules).toEqual(new Map([
    [Expr, alt(seq(nt(Factor), nt(ExprNext)))],
    [ExprNext, alt(
      seq(lit('+'), nt(Factor), nt(ExprNext)),
      seq(lit('-'), nt(Factor), nt(ExprNext)),
      seq()
    )],
    [Factor, alt(seq(nt(Term), nt(FactorNext)))],
    [FactorNext, alt(
      seq(lit('*'), nt(Term), nt(FactorNext)),
      seq(lit('/'), nt(Term), nt(FactorNext)),
      seq()
    )],
    [Term, alt(
      seq(lit('('), nt(Expr), lit(')')),
      seq({ type: "value" })
    )]
  ]))
});
