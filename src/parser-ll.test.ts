import { AST, builders, coreAST, print } from "./core";
import { createParser } from "./parser-ll";

const {
  ruleset,
  rule,
  seq,
  alt,
  lit,
  ident,
  terminal,
  sepBy0,
  sepBy1,
  structure,
  repeat0,
  repeat1,
  maybe,
} = builders;

test("json", () => {
  // prettier-ignore
  const grammar = ruleset(
    rule('expr', alt(
      seq((xs) => xs.reduce((l, r) => Object.assign(l, r), {}),
        structure('{', sepBy0(ident('pair'), lit(',')), '}'),
      ),
      structure('[', sepBy0(ident('expr'), lit(',')), ']'),
      seq(() => null, lit('null')),
      seq(() => true, lit('true')),
      seq(() => false, lit('false')),
      terminal('value')
    )),
    rule('pair', seq(
      (k, _, v) => ({ [k]: v }),
      terminal('value'), lit(':'), ident('expr')
    ))
  )
  const json = createParser(grammar);

  expect(json`"foo"`).toEqual("foo");
  expect(json`true`).toEqual(true);

  expect(json`{ "foo": 123 }`).toEqual({ foo: 123 });
});

test("core", () => {
  const lang = createParser(coreAST);
  const returnLangAST = lang`Main = "return" value : ${(_, x) => x}` as AST;
  const returnLang = createParser(returnLangAST);
  expect(returnLang`return 123`).toEqual(123);
});
