import { AST } from "./core";
import {
  lang,
  ZebuLanguageReturning,
  ZebuLanguage,
  createLanguage,
} from "./lang";
import { identifierOrOperator } from "./lexer";

type Fixity = "left" | "right" | "pre" | "post";
type SeqFn = (...xs: unknown[]) => unknown;
type OpExpr = { pattern: string[]; fn: SeqFn };
export type Rule = { fixity: Fixity; operators: OpExpr[] };

// prettier-ignore
export const op = lang`
  Program   = Rule* RootRule?    : ${(rules, root) =>  createLanguage(buildAST(rules, root))};
  Rule      = Fixity Expr+       : 
    ${(fixity: string, operators: OpExpr[]): Rule => ({ fixity: fixity as Fixity, operators })};
  Expr      = Pattern ":" value  : 
    ${( pattern: string[], _: unknown, fn: SeqFn): OpExpr => ({ pattern, fn })};
  Pattern   = value+;
  RootRule  = "root" identifier  : ${(_: unknown, x: unknown) => x};
  Fixity    = "left" | "right" | "pre" | "post";
` as ZebuLanguageReturning<ZebuLanguage>;

// TODO: this is basically the same logic as in ast.ts, should it be shared?
function formatNode(x: string): AST {
  if (typeof x !== "string" || !identifierOrOperator.test(x)) {
    return { type: "error", message: "invalid pattern" };
  }
  return { type: "literal", value: x };
}

const reduceLeft = (value: unknown, fns: SeqFn[]) =>
  fns.reduce((result, fn) => fn(result), value);
const reduceRight = (fns: SeqFn[], value: unknown) =>
  fns.reduceRight((result, fn) => fn(result), value);

// converts `"is" : ${x} | "is" "not" : ${y}`
// into `"is" (nil : ${x} | "not" : ${y})`
export function getOpAlts(ops: OpExpr[]): AST {
  const patternByFirst = new Map<string | null, OpExpr[]>();
  for (const {
    pattern: [first, ...rest],
    fn,
  } of ops) {
    const key = first || null;
    const arr: OpExpr[] = patternByFirst.get(key) || [];
    arr.push({ pattern: rest, fn });
    patternByFirst.set(key, arr);
  }

  const alts: AST[] = [];

  for (const [key, ops] of patternByFirst) {
    if (key === null) {
      if (ops.length > 1) {
        return { type: "error", message: "duplicate rules" };
      }
      alts.push({ type: "seq", exprs: [], fn: () => ops[0].fn });
    } else {
      const result = getOpAlts(ops);
      if (result.type === "seq") {
        const { exprs, fn } = result;
        alts.push({
          type: "seq",
          exprs: [formatNode(key), ...exprs],
          fn: (_, ...xs) => fn(...xs),
        });
      } else {
        alts.push({
          type: "seq",
          exprs: [formatNode(key), result],
          fn: (_, x) => x,
        });
      }
    }
  }

  if (alts.length === 1) return alts[0];
  return {
    type: "alt",
    exprs: alts,
  };
}

export function buildAST(rules: Rule[], rootExpr: string): AST {
  // apply rules bottom-to-top
  const topExpr = rules.reduceRight(
    (baseExpr: AST, rule: Rule): AST => {
      const opAlts = getOpAlts(rule.operators);
      switch (rule.fixity) {
        case "left": {
          const withOp: AST = {
            type: "seq",
            exprs: [opAlts, baseExpr],
            fn: (op: SeqFn, right) => (left) => op(left, right),
          };
          return {
            type: "seq",
            exprs: [baseExpr, { type: "repeat0", expr: withOp }],
            fn: reduceLeft,
          };
        }
        case "right": {
          const withOp: AST = {
            type: "seq",
            exprs: [baseExpr, opAlts],
            fn: (left, op: SeqFn) => (right) => op(left, right),
          };
          return {
            type: "seq",
            exprs: [{ type: "repeat0", expr: withOp }, baseExpr],
            fn: reduceRight,
          };
        }
        case "pre":
          return {
            type: "seq",
            exprs: [{ type: "repeat0", expr: opAlts }, baseExpr],
            fn: reduceRight,
          };
        case "post":
          return {
            type: "seq",
            exprs: [baseExpr, { type: "repeat0", expr: opAlts }],
            fn: reduceLeft,
          };

        // istanbul ignore next
        default:
          throw new Error("no match");
      }
    },
    { type: "identifier", value: "BaseExpr" }
  );

  const rootASTNode: AST = {
    type: "identifier",
    value: rootExpr || "value",
  };

  return {
    type: "ruleset",
    rules: [
      { name: "TopExpr", expr: topExpr },
      {
        name: "BaseExpr",
        expr: {
          type: "alt",
          exprs: [
            {
              type: "structure",
              startToken: "(",
              endToken: ")",
              expr: { type: "identifier", value: "TopExpr" },
            },
            rootASTNode,
          ],
        },
      },
    ],
  };
}
