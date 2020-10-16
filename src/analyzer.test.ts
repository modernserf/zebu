import { TreeAnalyzer } from "./analyzer";
import { coreAST } from "./core";

test("finds literals", () => {
  const result = TreeAnalyzer.analyze(coreAST);
  // prettier-ignore
  const operators = new Set([
    "{", "}", "(", ")", "[", "]", "#", ":", ";", "+", "|", "=", "++", "**", "*", "?", 
  ]);
  // prettier-ignore
  const keywords = new Set([
    "include", "value", "identifier", "operator", "keyword", "nil",
  ]);
  expect(result.operators).toEqual(operators);
  expect(result.keywords).toEqual(keywords);
});

test("expands `keyword` and `operator` terminals", () => {
  const result = TreeAnalyzer.analyze({
    type: "ruleset",
    rules: [
      {
        name: "Statement",
        expr: {
          type: "alt",
          exprs: [
            {
              type: "seq",
              fn: () => null,
              exprs: [
                { type: "literal", value: "if" },
                { type: "identifier", value: "Expr" },
                {
                  type: "structure",
                  startToken: "{",
                  endToken: "}",
                  expr: { type: "identifier", value: "Statement" },
                },
              ],
            },
            { type: "identifier", value: "Expr" },
          ],
        },
      },
      {
        name: "Expr",
        expr: {
          type: "alt",
          exprs: [
            {
              type: "structure",
              startToken: "(",
              endToken: ")",
              expr: { type: "terminal", value: "operator" },
            },
            {
              type: "seq",
              fn: () => null,
              exprs: [
                { type: "terminal", value: "identifier" },
                { type: "literal", value: "." },
                {
                  type: "alt",
                  exprs: [
                    { type: "terminal", value: "identifier" },
                    { type: "terminal", value: "keyword" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  });
  // TODO: actually check that the operator / keyword terminals are replaced
});

test("finds literals in nested scope", () => {
  const result = TreeAnalyzer.analyze({
    type: "ruleset",
    rules: [
      {
        name: "OpExpr",
        expr: {
          type: "ruleset",
          rules: [
            {
              name: "Inner",
              expr: {
                type: "seq",
                fn: () => null,
                exprs: [
                  { type: "literal", value: "#" },
                  { type: "identifier", value: "RootExpr" },
                ],
              },
            },
          ],
        },
      },
      {
        name: "RootExpr",
        expr: { type: "terminal", value: "value" },
      },
    ],
  });

  expect(result.operators).toEqual(new Set(["#"]));
});

test("raises if unknown identifier found", () => {
  expect(() => {
    TreeAnalyzer.analyze({ type: "identifier", value: "OhNo" });
  }).toThrow();
});

test("raises if trying to repeat a parser that matches nil", () => {
  expect(() => {
    TreeAnalyzer.analyze({
      type: "repeat0",
      expr: { type: "seq", fn: () => null, exprs: [{ type: "nil" }] },
    });
  }).toThrow();
});

test("raises if error node", () => {
  expect(() => {
    TreeAnalyzer.analyze({ type: "error", message: "here" });
  }).toThrow();
});

test.todo("sepBy0");
