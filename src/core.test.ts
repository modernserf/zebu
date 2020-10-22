import { coreAST, print, builders } from "./core";

test("pretty-printer", () => {
  expect(print(coreAST)).toEqual(`
Grammar = Rule ++ ";"
Rule = identifier "=" AltExpr
AltExpr = SeqExpr ++ "|"
SeqExpr = SepExpr+ (":" value)?
SepExpr = RepExpr ("**" RepExpr | "++" RepExpr | nil)
RepExpr = Expr ("*" | "+" | "?")?
Expr = #( AltExpr )
     | "#" (#( AltExpr ) | #{ AltExpr } | #[ AltExpr ])
     | "include" value
     | identifier
     | "identifier"
     | "operator"
     | "keyword"
     | "value"
     | "nil"
     | value`);

  const { error, repeat0, sepBy0, lit } = builders;

  const grammarWithOtherTokens = repeat0(sepBy0(error("message"), lit("foo")));
  expect(print(grammarWithOtherTokens)).toEqual(`(<error: message> ** "foo")*`);
});
