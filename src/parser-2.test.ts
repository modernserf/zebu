import { AST } from "./ast";
import { Token } from "./lexer";
import { ProductionTreeBuilder, parse, print } from "./parser-2";

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

function val(value: unknown): Token {
  return {
    type: "value",
    value,
    ...baseToken,
  };
}

test("recognizer", () => {
  const elseIfAST: AST = {
    type: "repeat0",
    expr: {
      type: "seq",
      fn: (_, __, { value }) => value,
      exprs: [
        { type: "literal", value: "else" },
        { type: "literal", value: "if" },
        { type: "terminal", value: "value" },
      ],
    },
  };

  const elseAST: AST = {
    type: "maybe",
    expr: {
      type: "seq",
      fn: (_, { value }) => value,
      exprs: [
        { type: "literal", value: "else" },
        { type: "terminal", value: "value" },
      ],
    },
  };

  const ast: AST = {
    type: "seq",
    fn: (_, { value }, elseIf, elseVal) => ({ value, elseIf, else: elseVal }),
    exprs: [
      { type: "literal", value: "if" },
      { type: "terminal", value: "value" },
      elseIfAST,
      elseAST,
    ],
  };
  const rules = new Map([["main", ast]]);
  const tree = new ProductionTreeBuilder(rules).buildRoot();

  expect(() => {
    const tokens = [
      kw("if"),
      val("foo"),
      kw("else"),
      kw("if"),
      val("bar"),
      kw("else"),
      val("baz"),
    ];

    parse(tokens, tree);
  }).not.toThrow();
});
