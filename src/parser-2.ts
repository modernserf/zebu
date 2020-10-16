import { AST } from "./ast";
import { Token } from "./lexer";

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
type ProductionTree = ProductionRule & { type: "tree" };

// { A -> next } + { B -> next } = { A -> B -> next }
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
      const result: ProductionTree = {
        type: "tree",
        value: new Map(),
      };
      let toMerge: ProductionTree | null = null;
      for (const [key, value] of left.value.entries()) {
        // (A | nil) B -> AB | B
        if (key === nilKey && right.type === "tree") {
          toMerge = right as ProductionTree;
        } else if (value.type === "next") {
          result.value.set(key, right);
        } else {
          result.value.set(key, concat(value, right, recur));
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

    const result: ProductionTree = { type: "tree", value: new Map(left.value) };
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
      case "maybe":
        return merge(nil, this.build(node.expr));
      default:
        throw new Error("unreachable");
    }
  }
}

const spaces = (n) => Array(n).fill(" ").join("");

export function print(node: ProductionRule, indent = 0): string {
  switch (node.type) {
    case "next":
      return ".";
    case "reduce":
      return `(${node.arity}) -> ${print(node.next, indent)}`;
    case "recur":
      return `(recur)`;
    case "tree": {
      const entries = Array.from(node.value.entries());
      if (entries.length === 1) {
        const [key, value] = entries[0];
        return `${key} -> ${print(value, indent)}`;
      }

      return `{\n${entries
        .map(
          ([key, value]) =>
            `${spaces(indent + 2)} ${key} -> ${print(value, indent + 2)}`
        )
        .join("\n")}\n${spaces(indent)}}`;
    }
  }
}

export function parse(tokens: Token[], initNode: ProductionRule): unknown[] {
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
      throw new Error("unexpected end of input");
    }

    let next: ProductionRule | undefined;
    if (token.type === "keyword" || token.type === "operator") {
      next = node.value.get(brandLiteral(token.value));
    }
    if (!next) {
      next = node.value.get(brandType(token.type));
    }
    if (!next) {
      next = node.value.get(nilKey);
    }
    if (!next)
      throw new Error(
        `expected ${[...node.value.keys()]}, received ${token.type}`
      );

    stack.push(token);
    node = next;
  }

  if (index < tokens.length) {
    throw new Error("expected end of input, received token");
  }

  return stack;
}
