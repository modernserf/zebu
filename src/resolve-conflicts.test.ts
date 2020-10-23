import { SimpleASTAlt, SimpleASTNode, SimpleASTSeq } from "./parser-ll";
import { factorLeft, inlineRules } from "./resolve-conflicts";

const alt = (...exprs: SimpleASTSeq[]): SimpleASTAlt => ({
  type: "alt",
  exprs,
});
const seq = (...exprs: SimpleASTNode[]): SimpleASTSeq => ({
  type: "seq",
  exprs,
});
const nt = (value: symbol): SimpleASTNode => ({ type: "nonterminal", value });
const lit = (value: string): SimpleASTNode => ({ type: "literal", value });

test("inlineRules", () => {
  const root = Symbol("root");
  const A = Symbol("A");
  const B = Symbol("B");
  const rules = new Map([
    [root, alt(seq(lit("x"), nt(A)), seq(nt(B), lit("y")))],
    [A, alt(seq(lit("a")))],
    [B, alt(seq(lit("b")))],
  ]);
  inlineRules(rules, root);
  expect(rules).toEqual(
    new Map([[root, alt(seq(lit("x"), lit("a")), seq(lit("b"), lit("y")))]])
  );
});

test("factorLeft", () => {
  const root = Symbol("root");
  const rules = new Map([
    [
      root,
      alt(
        seq(lit("x"), lit("a")),
        seq(lit("x"), lit("b")),
        seq(lit("x")),
        seq(lit("c"))
      ),
    ],
  ]);
  factorLeft(rules);
  const next = (rules.get(root)!.exprs[0].exprs[1] as SimpleASTNode & {
    type: "nonterminal";
  }).value;
  expect(rules).toEqual(
    new Map([
      [root, alt(seq(lit("x"), nt(next)), seq(lit("c")))],
      [next, alt(seq(lit("a")), seq(lit("b")), seq())],
    ])
  );
});
