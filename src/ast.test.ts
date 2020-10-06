import { AST, grammar } from "./ast";
import { parse } from "./parser";
import { tokenize } from "./simple-tokenizer";

const ast = (strs: TemplateStringsArray, ...xs: unknown[]) => {
  return parse(tokenize(strs.raw, xs), grammar);
};

test("ast", () => {
  // placeholder
  const ___ = () => undefined;

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
            { type: "value", value: ":" },
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
                    separator: { type: "value", value: "," },
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
                    separator: { type: "value", value: "," },
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
            { exprs: [{ type: "value", value: "true" }], fn: ___, type: "seq" },
            {
              exprs: [{ type: "value", value: "false" }],
              fn: ___,
              type: "seq",
            },
            { exprs: [{ type: "value", value: "null" }], fn: ___, type: "seq" },
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
                  separator: { type: "value", value: "," },
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
        expr: { expr: { type: "include", value: ___ }, type: "repeat0" },
        name: "Expr",
      },
    ],
    type: "ruleset",
  };

  expect(otherNodes).toEqual(matchOtherNodes);

  // TODO: ( #( include * + ++
});
