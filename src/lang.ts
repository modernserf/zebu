import { grammar } from "./ast";
import { compile } from "./compiler";
import { tokenize } from "./lexer";
import { parse, Parser, ParseSubject } from "./parser";

export function lang(
  strs: TemplateStringsArray,
  ...xs: unknown[]
): Parser<unknown> &
  ((strs: TemplateStringsArray, ...xs: unknown[]) => unknown) {
  const parserCore = compile(parse(tokenize(strs.raw, xs), grammar));

  function parser(strs: TemplateStringsArray, ...xs: unknown[]) {
    return parse(tokenize(strs.raw, xs), parserCore);
  }
  parser.firstTokenOptions = parserCore.firstTokenOptions;
  parser.parse = (state: ParseSubject) => parserCore.parse(state);

  return parser;
}
