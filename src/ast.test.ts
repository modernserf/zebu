import { AST, grammar } from "./ast";
import { parse } from "./parser";
import { tokenize } from "./lexer";

const ast = (strs: TemplateStringsArray, ...xs: unknown[]) => {
  return parse(tokenize(strs.raw, xs), grammar);
};

test("ast", () => {
  // placeholder
  const ___ = () => undefined;

  const nilAST = ast``;
  expect(nilAST).toEqual({ type: "nil" });

  const jsonAST = ast`
    Start = Expr;
    Pair  = value ":" Expr    : ${___};

    Expr  = #[ Expr ** "," ]  : ${___}
          | #{ Pair ** "," }  : ${___}
          | value
          | "true"            : ${___}
          | "false"           : ${___}
          | "null"            : ${___};
  `;

  const match: AST = {
    rules: [
      { name: "Start", expr: { type: "identifier", value: "Expr" } },
      {
        expr: {
          exprs: [
            { type: "identifier", value: "value" },
            { type: "literal", value: ":" },
            { type: "identifier", value: "Expr" },
          ],
          fn: ___,
          type: "seq",
        },
        name: "Pair",
      },
      {
        expr: {
          exprs: [
            {
              exprs: [
                {
                  expr: {
                    expr: { type: "identifier", value: "Expr" },
                    separator: { type: "literal", value: "," },
                    type: "sepBy0",
                  },
                  startToken: "[",
                  type: "structure",
                },
              ],
              fn: ___,
              type: "seq",
            },
            {
              exprs: [
                {
                  expr: {
                    expr: { type: "identifier", value: "Pair" },
                    separator: { type: "literal", value: "," },
                    type: "sepBy0",
                  },
                  startToken: "{",
                  type: "structure",
                },
              ],
              fn: ___,
              type: "seq",
            },
            { type: "identifier", value: "value" },
            {
              exprs: [{ type: "literal", value: "true" }],
              fn: ___,
              type: "seq",
            },
            {
              exprs: [{ type: "literal", value: "false" }],
              fn: ___,
              type: "seq",
            },
            {
              exprs: [{ type: "literal", value: "null" }],
              fn: ___,
              type: "seq",
            },
          ],
          type: "alt",
        },
        name: "Expr",
      },
    ],
    type: "ruleset",
  };

  expect(jsonAST).toEqual(match);

  const otherNodes = ast`
    Main = #( value ++ "," )+ | Expr?;
    Expr = (include ${___})*;
  `;

  const matchOtherNodes: AST = {
    rules: [
      {
        expr: {
          exprs: [
            {
              expr: {
                expr: {
                  expr: { type: "identifier", value: "value" },
                  separator: { type: "literal", value: "," },
                  type: "sepBy1",
                },
                startToken: "(",
                type: "structure",
              },
              type: "repeat1",
            },
            {
              type: "maybe",
              expr: { type: "identifier", value: "Expr" },
            },
          ],
          type: "alt",
        },
        name: "Main",
      },
      {
        expr: { expr: { type: "include", value: ___ as any }, type: "repeat0" },
        name: "Expr",
      },
    ],
    type: "ruleset",
  };

  expect(otherNodes).toEqual(matchOtherNodes);
});

test("ast errors and defaults", () => {
  const defaultSeq = ast`"foo" "bar"`;
  expect(defaultSeq).toMatchObject({
    type: "seq",
    exprs: [
      { type: "literal", value: "foo" },
      { type: "literal", value: "bar" },
    ],
  });

  const badSeq = ast`"foo" "bar" : ${3}`;
  expect(badSeq).toMatchObject({ type: "error" });

  const badLiteral = ast`1`;
  expect(badLiteral).toMatchObject({ type: "error" });

  const badLiteral2 = ast`"{"`;
  expect(badLiteral2).toMatchObject({ type: "error" });

  const badInclude = ast`include ${null}`;
  expect(badInclude).toMatchObject({ type: "error" });
});
