import { Lexer, Token } from "./lexer";

const operators = new Set(["{", "}", "(", ")", ">", ";"]);
const keywords = new Set(["if", "else"]);

function tok(strs: TemplateStringsArray, ...interps: unknown[]) {
  return new Lexer(keywords, operators).run(strs.raw, interps);
}

function strip(token: Token) {
  return {
    type: token.type,
    value: "value" in token ? token.value : undefined,
  };
}

test("basic tokens", () => {
  expect(tok`if foo > 1 { bar('baz'); }`.map(strip)).toEqual([
    { type: "keyword", value: "if" },
    { type: "identifier", value: "foo" },
    { type: "operator", value: ">" },
    { type: "value", value: 1 },
    { type: "operator", value: "{" },
    { type: "identifier", value: "bar" },
    { type: "operator", value: "(" },
    { type: "value", value: "baz" },
    { type: "operator", value: ")" },
    { type: "operator", value: ";" },
    { type: "operator", value: "}" },
  ]);

  expect(() => tok`"foo`).toThrow();
  expect(() => tok`"\n"`).toThrow();
});

test("interpolation", () => {
  expect(tok`1 ${2} /* ${3} */ "${4}" // ${5}`.map(strip)).toEqual([
    { type: "value", value: 1 },
    { type: "value", value: 2 },
    { type: "value", value: "4" },
  ]);

  expect(
    tok`
      1 
      ${2} /* 
      ${3} */ 
      "${4}" 
      // ${5}
    `.map(strip)
  ).toEqual([
    { type: "value", value: 1 },
    { type: "value", value: 2 },
    { type: "value", value: "4" },
  ]);
});
