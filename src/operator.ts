import { AST, checkLit } from "./core";
import {
  lang,
  ZebuLanguageReturning,
  ZebuLanguage,
  createLanguage,
} from "./lang";
import { assertUnreachable } from "./util";

type Fixity = "left" | "right" | "pre" | "post";
type SeqFn = (...xs: unknown[]) => unknown;
type OpExpr = { pattern: string[]; fn: SeqFn };
type Rule = { fixity: Fixity; operators: OpExpr[] };

// prettier-ignore
export const op = lang`
  Program   = Rule* RootRule? : 
    ${(rules, root) =>  createLanguage(buildAST(rules, root))};
  Rule      = Fixity Expr+ : 
    ${(fixity: Fixity, operators: OpExpr[]): Rule => ({ fixity, operators })};
  Expr      = Pattern ":" value : 
    ${( pattern: string[], _, fn: SeqFn): OpExpr => ({ pattern, fn })};
  Pattern   = value+;
  RootRule  = "root" identifier : ${(_: unknown, x: unknown) => x};
  Fixity    = "left" | "right" | "pre" | "post";
` as ZebuLanguageReturning<ZebuLanguage>;

export function buildAST(rules: Rule[], rootExpr: string): AST {
  const ruleset: AST = { type: "ruleset", rules: [] };
  let next: AST = { type: "identifier", value: "0" };
  for (const [i, rule] of rules.entries()) {
    const push = (expr: AST) => ruleset.rules.push({ name: String(i), expr });
    const self: AST = { type: "identifier", value: String(i) };
    next = { type: "identifier", value: String(i + 1) };
    const opAlts: AST = {
      type: "alt",
      exprs: rule.operators.map(({ pattern, fn }) => ({
        type: "seq",
        exprs: pattern.map(checkLit),
        fn: () => fn,
      })),
    };

    switch (rule.fixity) {
      case "left": {
        push({
          type: "alt",
          exprs: [
            {
              type: "seq",
              exprs: [self, opAlts, next],
              fn: (l, op, r) => op(l, r),
            },
            next,
          ],
        });
        break;
      }
      case "right": {
        push({
          type: "alt",
          exprs: [
            {
              type: "seq",
              exprs: [next, opAlts, self],
              fn: (l, op, r) => op(l, r),
            },
            next,
          ],
        });
        break;
      }
      case "pre":
        push({
          type: "alt",
          exprs: [
            {
              type: "seq",
              exprs: [opAlts, self],
              fn: (op, r) => op(r),
            },
            next,
          ],
        });
        break;
      case "post":
        push({
          type: "alt",
          exprs: [
            {
              type: "seq",
              exprs: [self, opAlts],
              fn: (l, op) => op(l),
            },
            next,
          ],
        });
        break;
      // istanbul ignore next
      default:
        assertUnreachable(rule.fixity);
    }
  }

  const rootASTNode: AST = rootExpr
    ? {
        type: "identifier",
        value: rootExpr,
      }
    : { type: "terminal", value: "value" };

  ruleset.rules.push({
    name: next.value,
    expr: {
      type: "alt",
      exprs: [
        {
          type: "structure",
          startToken: "(",
          endToken: ")",
          expr: { type: "identifier", value: "0" },
        },
        rootASTNode,
      ],
    },
  });

  return ruleset;
}
