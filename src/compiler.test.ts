import { compile as compileBase } from "./compiler";
import { parse } from "./parser";
import { Token } from "./lexer";

const baseToken = {
  index: 0,
  outerIndex: 0,
  length: 0,
};

function kw(value: string): Token {
  return {
    type: "keyword",
    value,
    ...baseToken,
  };
}

function id(value: string): Token {
  return {
    type: "identifier",
    value,
    ...baseToken,
  };
}

function op(value: string): Token {
  return {
    type: "operator",
    value,
    ...baseToken,
  };
}

const compile = (ast) => compileBase(ast).parser;

test("simple parsers", () => {
  expect(() => {
    compile({ type: "not a type" } as any);
  }).toThrow();

  const nil = compile({ type: "nil" });
  expect(parse([], nil)).toEqual(null);

  expect(() => compile({ type: "error", message: "" })).toThrow();

  const ident = compile({ type: "identifier", value: "identifier" });
  expect(parse([id("foo")], ident)).toEqual("foo");

  const literal = compile({ type: "literal", value: "foo" });
  expect(parse([kw("foo")], literal)).toEqual("foo");

  const included = compile({ type: "include", value: () => literal });
  expect(parse([kw("foo")], included)).toEqual("foo");
  expect(() => {
    compile({ type: "include", value: () => ({} as any) });
  }).toThrow();

  const parens = compile({
    type: "structure",
    startToken: "(",
    endToken: ")",
    expr: { type: "literal", value: "foo" },
  });
  expect(parse([op("("), kw("foo"), op(")")], parens)).toEqual("foo");

  const maybe = compile({
    type: "maybe",
    expr: { type: "literal", value: "foo" },
  });
  expect(parse([kw("foo")], maybe)).toEqual("foo");
  expect(parse([], maybe)).toEqual(null);

  const repeat0 = compile({
    type: "repeat0",
    expr: { type: "identifier", value: "identifier" },
  });
  expect(parse([], repeat0)).toEqual([]);
  expect(parse([id("foo"), id("bar")], repeat0)).toEqual(["foo", "bar"]);

  const repeat1 = compile({
    type: "repeat1",
    expr: { type: "identifier", value: "identifier" },
  });
  expect(() => parse([], repeat1)).toThrow();
  expect(parse([id("foo"), id("bar")], repeat1)).toEqual(["foo", "bar"]);

  const sepBy0 = compile({
    type: "sepBy0",
    expr: { type: "identifier", value: "identifier" },
    separator: { type: "literal", value: "," },
  });
  expect(parse([], sepBy0)).toEqual([]);
  expect(parse([id("foo"), op(","), id("bar")], sepBy0)).toEqual([
    "foo",
    "bar",
  ]);
  expect(parse([id("foo"), op(","), id("bar"), op(",")], sepBy0)).toEqual([
    "foo",
    "bar",
  ]);

  const sepBy1 = compile({
    type: "sepBy1",
    expr: { type: "identifier", value: "identifier" },
    separator: { type: "literal", value: "," },
  });
  expect(() => parse([], sepBy1)).toThrow();
  expect(parse([id("foo"), op(","), id("bar")], sepBy1)).toEqual([
    "foo",
    "bar",
  ]);
  expect(parse([id("foo"), op(","), id("bar"), op(",")], sepBy1)).toEqual([
    "foo",
    "bar",
  ]);

  const seq = compile({
    type: "seq",
    exprs: [
      { type: "literal", value: "def" },
      { type: "identifier", value: "identifier" },
    ],
    fn: (_, x) => x,
  });
  expect(parse([kw("def"), id("foo")], seq)).toEqual("foo");

  const alt = compile({
    type: "alt",
    exprs: [
      { type: "literal", value: "foo" },
      { type: "literal", value: "bar" },
    ],
  });

  expect(parse([kw("foo")], alt)).toEqual("foo");
  expect(parse([kw("bar")], alt)).toEqual("bar");
  expect(() => parse([kw("baz")], alt)).toThrow();
});

test("rulesets", () => {
  const rule1 = compile({
    type: "ruleset",
    rules: [{ name: "Main", expr: { type: "literal", value: "foo" } }],
  });
  expect(parse([kw("foo")], rule1)).toEqual("foo");

  const rule2 = compile({
    type: "ruleset",
    rules: [
      { name: "Main", expr: { type: "identifier", value: "Expr" } },
      { name: "Expr", expr: { type: "literal", value: "foo" } },
    ],
  });
  expect(parse([kw("foo")], rule2)).toEqual("foo");

  expect(() => {
    compile({
      type: "ruleset",
      rules: [
        { name: "Main", expr: { type: "identifier", value: "Unknown" } },
        { name: "Expr", expr: { type: "literal", value: "foo" } },
      ],
    });
  }).toThrow();

  expect(() => {
    compile({
      type: "ruleset",
      rules: [
        { name: "Main", expr: { type: "identifier", value: "Expr" } },
        { name: "Expr", expr: { type: "identifier", value: "Main" } },
      ],
    });
  }).toThrow();
});
