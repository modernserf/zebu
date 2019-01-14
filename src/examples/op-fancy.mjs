import { grammar } from '../index'

const _1 = (x) => x
const _2 = (_, x) => x
const tag = (type) => (...xs) => [tag, ...xs]

const op = grammar`
  Grammar   = RuleSet ++ Divider RootRule? : ${compiler}
  RuleSet   = Rule ++ line
  Rule      = RuleBody ":" value 
              : ${(ruleBody, _, mapFn) => ({ ...ruleBody, mapFn })}
  RuleBody  = Pattern? ("." Pattern ${_2})* "*" (Pattern "." ${_1})* Pattern?
              : ${(prefix, rightAssoc, _, leftAssoc, pattern) => ({ prefix, rightAssoc, leftAssoc, pattern })}
  Pattern   = (value | identifier)+
  RootRule  = Divider value
  Divider   = "---" line
`

function compiler (ruleSets, rootRule) {
  if (rootRule) {
    if (!rootRule.parse) { throw new Error('root rule must be a parser') }
  }
}

export function test_stylish_operator_dsl (expect) {
  const lang = op`
    . line *      : ${tag('program')}
    ---
    . "=" *       : ${tag('rule')}
    ---
    "#" "(" * ")" : ${tag('inParen')}
    "#" "[" * "]" : ${tag('inBrackets')}
    "#" "{" * "}" : ${tag('inBraces')}
    "(" * ")"     : ${(x) => x}
    ---
    * "|" .     : ${tag('alt')}
    ---
    * : .       : ${tag('mapFn')}
    ---
    * nil .     : ${tag('seq')}
    ---
    * "**" .    : ${tag('sepBy')}
    * "++" .    : ${tag('sepBy1')}
    --
    * "*"       : ${tag('repeat')}
    * "+"       : ${tag('repeat1')}
    * "?"       : ${tag('maybe')}
    ---
    "include" * : ${tag('include')}
  `
}
