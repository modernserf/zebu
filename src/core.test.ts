import { coreAST, print, builders } from './core';

test('pretty-printer', () => {
  expect(print(coreAST)).toEqual(`
Grammar = Rule ++ ";"
Rule = identifier "=" AltExpr
AltExpr = "|"? SeqExpr ("|" SeqExpr)*
SeqExpr = SepExpr (SepExpr* ":" value)?
SepExpr = SepExpr "**" RepExpr
        | SepExpr "++" RepExpr
        | RepExpr
RepExpr = Expr "*"
        | Expr "+"
        | Expr "?"
        | Expr
Expr = #( AltExpr )
     | "#" #( AltExpr )
     | "#" #[ AltExpr ]
     | "#" #{ AltExpr }
     | "include" value
     | identifier
     | "identifier"
     | "operator"
     | "keyword"
     | "value"
     | "nil"
     | value`);

  const { error, repeat1, sepBy0, lit, seq, alt } = builders;

  const grammarWithOtherTokens = repeat1(sepBy0(error('message'), lit('foo')));
  expect(print(grammarWithOtherTokens)).toEqual(`(<error: message> ** "foo")+`);

  const grammarWithInnerAlt = seq(
    () => null,
    alt(lit('foo'), lit('bar')),
    lit('baz')
  );
  expect(print(grammarWithInnerAlt)).toEqual(`("foo" | "bar") "baz"`);

  const grammarWithEmptySeq = seq(() => null);
  expect(print(grammarWithEmptySeq)).toEqual(`nil`);
});
