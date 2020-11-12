import { lang } from '../lang';

// prettier-ignore
export const zebu = lang`
  /*
  Zebu grammars are composed from a list of rules, separated by semicolons. Rules do not have to be defined in any particular order (a rule can reference rules either above or below it), but the top rule is the rule for the whole grammar. It will probably make the most sense if your rules read as top-down.
  */
  Program = Rule ++ ";"             : ${rules => ({ type: 'ruleset', rules })};
  Rule    = identifier "=" AltExpr  : ${(name, _, expr) => ({ name, expr })};
  /*
  The pipe character, "|", like in regular expressions, is the alternation operator, and (Foo | Bar) matches either of the rules Foo or Bar.
  The behavior of this operator happens to be one of the major differences between traditional CFG parsers (including Zebu) and PEG parsers. In Zebu, the order of branches doesn't matter -- the parser looks ahead at the next tokens and chooses the branch based on that. However, this means that each branch must not overlap; if they do, Zebu will raise a "first/first conflict" error. 
  On the other hand, PEG parsers try each branch in order, and backtrack if one doesn't succeed. This means that branches _can_ overlap, though more often than not overlapping branches are an indication of a bug, not a desirable feature.
  */
  AltExpr = SeqExpr ++ "|" : ${exprs => ({ type: 'alt', exprs })};
  /*
  A sequence of expressions, e.g. (Foo Bar) matches Foo followed by Bar and returns the result of the first expression. A sequence of expressions followed by a colon and an interpolated function matches that sequence and passes the results of each expression into that function, returning the result.
  */
  SeqExpr = SepExpr+ SeqFn? : ${(exprs, fn) => ({ type: 'seq', exprs, fn })};
  SeqFn   = ":" value       : ${(_, fn) => fn};
  /*
  The operators "++" and "**" are used for matching sequences with separators, eg. function arguments separated by commas, or statements separated by semicolons, and return an array of the matched expression (ignoring the separators). The "++" operator matches one or more elements, while the "**" operator matches zero or more. Both allow optional trailing separators. For example, the expression (value ++ ",") will match the following strings, and return the values:
  "1" -> [1]
  "1," -> [1]
  "1, 2" -> [1, 2]
  The expression (value ** ",") will match the above strings with the same results, and also match:
  "" -> []
  If you explicitly do _not_ want trailing separators to be valid, use something like (value ("," value)*)
  */
  SepExpr = SepExpr "++" RepExpr : ${(expr, _, separator) => ({ type: 'sepBy1',expr, separator })}
          | SepExpr "**" RepExpr : ${(expr, _, separator) => ({ type: 'sepBy0', expr, separator })}
          | RepExpr;
  /*
  The operators "*", "+" and "?" work similarly to how they work in regular expressions:
  (Expr*) matches a sequence of 0 or more Exprs and returns an array,
  (Expr+) matches a sequence of 1 or more Exprs and returns an array,
  (Expr?) optionally matches an Expr, and returns null if it doesn't match.
  */
  RepExpr = BaseExpr "+"  : ${(expr) => ({ type: 'repeat1', expr })}
          | BaseExpr "*"  : ${(expr) => ({ type: 'repeat0', expr })}
          | BaseExpr "?"  : ${(expr) => ({ type: 'maybe', expr })}
          | BaseExpr;
  /*
  As this grammar is written in top-down order, the operators are listed in lowest to highest precedence order. The following expressions have the highest precedence.
  */
  BaseExpr 
    /*
    Use parentheses to control precedence, as you would with arithmetic or regular expressions.
    */
    = #( AltExpr )
    /*
    #( ), #[ ] and #{ } are shorthands for expressions wrapped in parentheses, brackets and curly braces, respectively, e.g.
    #( Foo ) 
    is equivalent to:
    "(" Foo ")" : ${(_, value) => value}
    */
    | "#" #( AltExpr ) : ${(_, expr) => ({ type: 'structure', expr, startToken: '(', endToken: ')' })}
    | "#" #[ AltExpr ] : ${(_, expr) => ({ type: 'structure', expr, startToken: '[', endToken: ']' })}
    | "#" #{ AltExpr } : ${(_, expr) => ({ type: 'structure', expr, startToken: '{', endToken: '}' })}
    /*
    use "include" to embed one grammar inside another. If you use this, it will probably be for using the operator grammar; see the docs in operator.ts.
    */
    | "include" value : ${(_, grammar) => ({ type: 'include', ast: grammar.ast })}
    /*
    When Zebu parses a template string, it first removes all of the whitespace and comments and chunks the remaining text into tokens. There are three types of tokens:
    literal: any string explicitly quoted in the grammar.
    value: a string in quotations, number, or interpolated value
    identifier: a string that matches the pattern for a JavaScript identifier
    
    The following rules match a single token:
    Match any 'value' token.
    */
    | "value" : ${() => ({ type: 'terminal', value:  'value' })} 
    /*
    Match any identifier token.
    */
    | "identifier" : ${() => ({ type: 'terminal', value: 'identifier' })}
    /* 
    Match a literal that also matches the identifier rules. You might use this in a situation where keywords cannot be used as the names of variables, but _can_ be used as 
    */
    | "keyword"    : ${() => ({ type: 'terminal', value: 'keyword' })}
    /*
    Match a literal that does _not_ match the identifier rules. You will probably never use this.
    */
    | "operator"   : ${() => ({ type: 'terminal', value: 'operator' })}
    /*
    Match no tokens, and return null.
    */
    | "nil"
    /*
    All other identifiers in a grammar will match the rule with that name. Zebu will raise an error if there is no rule by that name.
    */
    | identifier
    /*
    A quoted string in the grammar refers to a literal value.
    */
    | value : ${(value) => ({ type: "literal", value })}
`;
