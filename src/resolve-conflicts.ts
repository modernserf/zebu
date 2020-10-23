import { SimpleASTAlt, SimpleASTNode, SimpleASTSeq } from "./parser-ll";
import { assertUnreachable } from "./util";

export function resolveConflicts(
  rules: Map<symbol, SimpleASTAlt>,
  firstRule: symbol
): void {
  // inlineRules(rules, firstRule);
  factorLeft(rules);
}

// a X | a Y -> a (X | Y)
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
      const updatedRule: SimpleASTAlt = { type: "alt", exprs: [] };
      for (const [prefix, rest] of byPrefix) {
        if (
          rest.exprs.length > 0 &&
          rest.exprs.some((expr) => expr.exprs.length > 0)
        ) {
          const key = Symbol();
          rules.set(key, rest);
          updatedRule.exprs.push({
            type: "seq",
            exprs: [prefix, { type: "nonterminal", value: key }].filter(
              Boolean
            ) as SimpleASTNode[],
          });
        } else {
          updatedRule.exprs.push({
            type: "seq",
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
        alt.exprs.push({ type: "seq", exprs: rest });
        needsFactoring = true;
        found = true;
        break;
      }
    }
    if (!found) {
      map.set(prefix || null, {
        type: "alt",
        exprs: [{ type: "seq", exprs: rest }],
      });
    }
  }

  if (needsFactoring) return map;
  return null;
}

function isEqual(l: SimpleASTNode | null, rIn: SimpleASTNode | null) {
  if (l === rIn) return true;
  if (!l || !rIn) return false;
  if (l.type !== rIn.type) return false;
  const r = rIn as any; // :(
  switch (l.type) {
    case "identifier":
    case "value":
      return true;
    case "literal":
      return l.value === r.value;
    case "nonterminal":
      return l.value === r.value;
    case "reduce":
      return l.arity === r.arity && l.fn === r.fn;
    case "repeat0":
      return isEqual(l.expr, r.expr);
    case "sepBy1":
      return isEqual(l.expr, r.expr) && isEqual(l.separator, r.separator);
    // istanbul ignore next
    default:
      assertUnreachable(l);
  }
}

export function inlineRules(
  rules: Map<symbol, SimpleASTAlt>,
  firstRuleName: symbol
): void {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rulesToInline = new Set<symbol>();

    for (const [ruleName, rule] of rules) {
      if (ruleName === firstRuleName) continue;
      for (const seq of rule.exprs) {
        if (seq.exprs.every(canInline)) {
          rulesToInline.add(ruleName);
        }
      }
    }

    if (rulesToInline.size === 0) return;

    for (const ruleToInlineName of rulesToInline) {
      for (const [ruleName, targetRule] of rules) {
        if (ruleName === ruleToInlineName) continue;
        const ruleToInline = rules.get(ruleToInlineName)!;
        const result: SimpleASTAlt = { type: "alt", exprs: [] };

        for (const seq of targetRule.exprs) {
          for (const nextSeq of altsForSeq(
            ruleToInline,
            ruleToInlineName,
            seq.exprs
          )) {
            result.exprs.push(nextSeq);
          }
        }

        rules.set(ruleName, result);
      }
    }

    for (const ruleName of rulesToInline) {
      rules.delete(ruleName);
    }
  }
}

function canInline(node: SimpleASTNode) {
  if (node.type === "nonterminal") return false;
  if (node.type === "sepBy1")
    return canInline(node.expr) && canInline(node.separator);
  if (node.type === "repeat0") return canInline(node.expr);
  return true;
}

// (a | b) C -> aC | bC
// (a | b) (c | d) -> a (c | d) | b (c | d) -> ac | ad | bc | bd
function* altsForSeq(
  ruleToInline: SimpleASTAlt,
  ruleName: symbol,
  exprs: SimpleASTNode[]
): Generator<SimpleASTSeq> {
  const isRule = (expr: SimpleASTNode) =>
    expr.type === "nonterminal" && expr.value === ruleName;

  if (!exprs.some(isRule)) {
    yield { type: "seq", exprs };
    return;
  }

  const [head, ...tail] = exprs;
  if (isRule(head)) {
    for (const prefix of ruleToInline.exprs) {
      for (const restSeq of altsForSeq(ruleToInline, ruleName, tail)) {
        yield { type: "seq", exprs: [...prefix.exprs, ...restSeq.exprs] };
      }
    }
  } else {
    for (const restSeq of altsForSeq(ruleToInline, ruleName, tail)) {
      yield { type: "seq", exprs: [head, ...restSeq.exprs] };
    }
  }
}
