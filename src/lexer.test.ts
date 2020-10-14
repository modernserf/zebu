import { Token, tokenize } from "./lexer";
function tok(strs: TemplateStringsArray, ...interps: unknown[]) {
  return tokenize(strs.raw, interps);
}

function strip(token: Token) {
  return {
    type: token.type,
    value: "value" in token ? token.value : undefined,
  };
}

test("basic tokens", () => {
  expect(tok`foo "bar" { -123.45 } + 0xDEADBEEF,; 'baz'`.map(strip)).toEqual([
    { type: "identifier", value: "foo" },
    { type: "value", value: "bar" },
    { type: "operator", value: "{" },
    { type: "value", value: -123.45 },
    { type: "operator", value: "}" },
    { type: "operator", value: "+" },
    { type: "value", value: 0xdeadbeef },
    { type: "operator", value: "," },
    { type: "operator", value: ";" },
    { type: "value", value: "baz" },
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
