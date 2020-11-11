import { lang } from '../lang';

export const zebu = lang`
  /*
  Zebu grammars are composed from a list of rules, separated by semicolons. Rules do not have to be defined in any particular order (a rule can reference rules either above or below it), but the top rule is the rule for the whole grammar. It will probably make the most sense if your rules read as top-down.
  */
  Program = Rule ++ ";"             : ${rules => compile(rules)};
  Rule    = identifier "=" AltExpr  : ${(name, _, expr) => ({ name, expr })};
  /*
  The pipe character, "|", like in regular expressions, is the alternation operator, and (Foo | Bar) matches either of the rules Foo or Bar.
  The behavior of this operator happens to be one of the major differences between traditional CFG parsers (including Zebu) and PEG parsers. In Zebu, the order of branches doesn't matter -- the parser looks ahead at the next tokens and chooses the branch based on that. However, this means that each branch must not overlap; if they do, Zebu will raise a "first/first conflict" error. 
  On the other hand, PEG parsers try each branch in order, and backtrack if one doesn't succeed. This means that branches _can_ overlap, though more often than not overlapping branches are an indication of a bug, not a desirable feature.
  */
  AltExpr = SeqExpr ++ "|" : ${exprs => ({ type: 'alt', exprs })};
  /*
  A sequence of expressions, e.g. (Foo Bar) matches Foo followed by Bar and returns the result of the first expression. 
  */
  SeqExpr = SepExpr+ SeqFn? : ${(exprs, fn) => ({ type: 'seq', exprs, fn })};
  SeqFn   = ":" value       : ${(_, fn) => fn}; 
`;
