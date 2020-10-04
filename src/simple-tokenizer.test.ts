import { Token, tokenize } from "./simple-tokenizer";
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
  expect(tok`foo "bar" -123.45 + 0xDEADBEEF,; 'baz'`.map(strip)).toEqual([
    { type: "identifier", value: "foo" },
    { type: "value", value: "bar" },
    { type: "value", value: -123.45 },
    { type: "operator", value: "+" },
    { type: "value", value: 0xdeadbeef },
    { type: "operator", value: "," },
    { type: "operator", value: ";" },
    { type: "value", value: "baz" },
  ]);
});

test("structures", () => {
  const toks: any = tok`(foo [${1} { 2: 3 } ${4}])`;
  expect(toks).toMatchObject([{ type: "structure", startToken: "(" }]);
  expect(toks[0].value).toMatchObject([
    { type: "identifier", value: "foo" },
    { type: "structure", startToken: "[" },
  ]);
  expect(toks[0].value[1].value).toMatchObject([
    { type: "value", value: 1 },
    { type: "structure", startToken: "{" },
    { type: "value", value: 4 },
  ]);
  expect(toks[0].value[1].value[1].value).toMatchObject([
    { type: "value", value: 2 },
    { type: "operator", value: ":" },
    { type: "value", value: 3 },
  ]);
});

test("structure errors", () => {
  expect(() => tok`{ foo ]`).toThrow();
  expect(() => tok`{ foo`).toThrow();
  expect(() => tok`foo }`).toThrow();
  expect(() => tok`"foo`).toThrow();
  expect(
    () => tok`
    "foo
    bar"`
  ).toThrow();
});

test("interpolation", () => {
  expect(tok`1 ${2} /* ${3} */ "${4}" // ${5}`.map(strip)).toEqual([
    { type: "value", value: 1 },
    { type: "value", value: 2 },
    { type: "value", value: "4" },
    { type: "line" },
  ]);
});

test("line coalescing", () => {
  expect(
    tok`
    foo // comment

    /* block comment */

    // another comment

    bar
  `.map(strip)
  ).toEqual([
    { type: "line" },
    { type: "identifier", value: "foo" },
    { type: "line" },
    { type: "identifier", value: "bar" },
    { type: "line" },
  ]);
});
