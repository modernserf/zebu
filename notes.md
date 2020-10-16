# notes

## Errors

- parse errors have own stack trace based on named parsing rules
  `new Rule(parser: Parser, info: RuleInfo)` just catches and rethrows errors, adding the rule name & source info to the stack, plus the index of the _first_ token matching the rule
