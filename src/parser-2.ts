import { AST } from "./ast";
import { Token } from "./lexer";
import { assertUnreachable } from "./util";

type Brand<K, T> = K & { __brand: T };
type FirstTokenOption = Brand<string, "FirstTokenOption">;
const brandLiteral = (value: string) => `literal-${value}` as FirstTokenOption;
const brandType = (type: string) => `type-${type}` as FirstTokenOption;

type ProductionRule =
  | { type: "tree"; value: Map<FirstTokenOption, ProductionRule> }
  | { type: "next" }
  | { type: "recur"; next: ProductionRule }
  | {
      type: "reduce";
      arity: number;
      fn: (...xs: unknown[]) => unknown;
      next: ProductionRule;
    };

const next: ProductionRule = { type: "next" };
const nilKey = "nil" as FirstTokenOption;
const nil: ProductionRule = { type: "tree", value: new Map([[nilKey, next]]) };

// { A -> next } + { B -> next } = { A -> B -> next }
// TODO: should we use use equivalent of "difference list" to allow O(1) concatenation?
// ie `(next) => { foo -> next, bar -> baz -> next }`
export function concat(
  left: ProductionRule,
  right: ProductionRule,
  recur: ProductionRule | null = null
): ProductionRule {
  if (right.type === "next") {
    return left;
  }
  switch (left.type) {
    case "recur": {
      if (recur) return recur;
      recur = { type: "recur", next };
      recur.next = concat(left.next, right, recur);
      return recur;
    }
    case "next":
      return right;
    case "reduce":
      return { ...left, next: concat(left.next, right, recur) };
    case "tree": {
      const result = {
        type: "tree" as const,
        value: new Map<FirstTokenOption, ProductionRule>(),
      };
      let toMerge: ProductionRule | null = null;
      for (const [key, value] of left.value.entries()) {
        const nextValue = concat(value, right, recur);
        // (A | nil) B -> AB | B
        if (key === nilKey && right.type === "tree") {
          toMerge = nextValue;
        } else {
          result.value.set(key, nextValue);
        }
      }
      if (toMerge) {
        return merge(result, toMerge);
      }

      return result;
    }
  }
}

// { A -> next } | { B -> next } = { A -> next, B -> next }
export function merge(
  left: ProductionRule,
  right: ProductionRule
): ProductionRule {
  if (left.type === "recur") {
    return { type: "recur", next: merge(left.next, right) };
  }
  if (right.type === "recur") {
    return { type: "recur", next: merge(left, right.next) };
  }
  if (left.type === "next" && right.type !== "next") {
    return right;
  }
  if (left.type !== "next" && right.type === "next") {
    return left;
  }
  if (left.type === "tree" && right.type === "tree") {
    if (left.value.size === 0) return right;

    const result = { type: "tree" as const, value: new Map(left.value) };
    for (const [key, rightVal] of right.value.entries()) {
      const leftVal = result.value.get(key);
      if (!leftVal) {
        result.value.set(key, rightVal);
      } else {
        result.value.set(key, merge(leftVal, rightVal));
      }
    }
    return result;
  }

  throw new Error(`cannot merge ${left.type} and ${right.type}`);
}

export class ProductionTreeBuilder {
  cache: WeakMap<AST, ProductionRule> = new WeakMap();
  constructor(readonly rules: Map<string, AST>) {}
  buildRoot(): ProductionRule {
    const topRule = Array.from(this.rules.values())[0];
    return this.build(topRule);
  }
  private build(node: AST): ProductionRule {
    if (this.cache.has(node)) return this.cache.get(node)!;
    // TODO: what do i need for in-progress nodes?

    const result = this.buildWithoutCache(node);
    this.cache.set(node, result);

    return result;
  }
  private buildWithoutCache(node: AST): ProductionRule {
    switch (node.type) {
      case "error":
        throw new Error(node.message);
      case "identifier":
        if (this.rules.has(node.value)) {
          return this.build(this.rules.get(node.value)!);
        }
        throw new Error("unknown rule");
      case "nil":
        return nil;
      // TODO: `keyword` and `operator` terminals should return all of their respective literals, not a token type
      case "terminal":
        return {
          type: "tree",
          value: new Map([[brandType(node.value), next]]),
        };
      case "literal":
        return {
          type: "tree",
          value: new Map([[brandLiteral(node.value), next]]),
        };
      case "seq": {
        const nodes = node.exprs.map((expr) => this.build(expr));
        const out = nodes.reduceRight((r, l) => concat(l, r), {
          type: "reduce",
          arity: node.exprs.length,
          fn: node.fn,
          next,
        });
        return out;
      }
      case "alt": {
        const nodes = node.exprs.map((expr) => this.build(expr));
        const out = nodes.reduce(merge);
        return out;
      }
      case "repeat0": {
        const ref: ProductionRule = { type: "recur", next };
        const result = merge(
          nil,
          concat(this.build(node.expr), {
            type: "reduce",
            arity: 2,
            fn: (arr: unknown[], x) => {
              arr.push(x);
              return arr;
            },
            next: ref,
          })
        );
        ref.next = result;
        return { type: "reduce", arity: 0, fn: () => [], next: ref };
      }
      case "repeat1": {
        const ref: ProductionRule = { type: "recur", next };
        const expr = this.build(node.expr);
        const result = merge(
          nil,
          concat(expr, {
            type: "reduce",
            arity: 2,
            fn: (arr: unknown[], x) => {
              arr.push(x);
              return arr;
            },
            next: ref,
          })
        );
        ref.next = result;
        return concat(expr, {
          type: "reduce",
          arity: 1,
          fn: (first) => [first],
          next: ref,
        });
      }
      case "maybe":
        return merge(nil, this.build(node.expr));
      case "structure":
        return this.build({
          type: "seq",
          fn: (_, x) => x,
          exprs: [
            { type: "literal", value: node.startToken },
            node.expr,
            { type: "literal", value: node.endToken },
          ],
        });
      default:
        assertUnreachable(node);
    }
  }
}

const spaces = (n) => Array(n).fill(" ").join("");

export function print(
  node: ProductionRule,
  indent = 0,
  recur: ProductionRule | null = null
): string {
  switch (node.type) {
    case "next":
      return ".";
    case "reduce":
      return `(${node.arity}) -> ${print(node.next, indent, recur)}`;
    case "recur":
      if (recur) return `(recur)`;
      return print(node.next, indent, node);
    case "tree": {
      const entries = Array.from(node.value.entries());
      if (entries.length === 1) {
        const [key, value] = entries[0];
        return `${key} -> ${print(value, indent, recur)}`;
      }

      return `{\n${entries
        .map(
          ([key, value]) =>
            `${spaces(indent + 2)} ${key} -> ${print(value, indent + 2, recur)}`
        )
        .join("\n")}\n${spaces(indent)}}`;
    }
  }
}

export function parse(tokens: Token[], initNode: ProductionRule): unknown {
  let node = initNode;
  let index = 0;
  const stack: unknown[] = [];
  while (node.type !== "next") {
    if (node.type === "reduce") {
      stack.push(node.fn(...stack.splice(-node.arity, node.arity)));
      node = node.next;
      continue;
    }
    if (node.type === "recur") {
      node = node.next;
      continue;
    }

    const token = tokens[index++];
    if (!token) {
      const next = node.value.get(nilKey);
      if (!next) {
        throw new Error("unexpected end of input");
      }
      node = next;
      continue;
    }

    let next: ProductionRule | undefined;
    if (token.type === "keyword" || token.type === "operator") {
      next = node.value.get(brandLiteral(token.value));
    }
    if (!next) {
      next = node.value.get(brandType(token.type));
    }

    if (next) {
      stack.push(token.value);
      node = next;
      continue;
    }

    next = node.value.get(nilKey);
    if (next) {
      node = next;
      continue;
    }

    throw new Error(
      `expected ${[...node.value.keys()]}, received ${token.type}`
    );
  }

  if (index < tokens.length) {
    throw new Error("expected end of input, received token");
  }

  return stack.pop();
}
