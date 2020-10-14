import { grammar } from "./ast";
import { compile, rootLanguageLiterals } from "./compiler";
import { tokenize } from "./lexer";
import { parse, Parser, ParseSubject, Seq, Zero } from "./parser";

export type ZebuLanguageReturning<Type> = Parser<unknown> &
  ((strs: TemplateStringsArray, ...xs: unknown[]) => Type);

export type ZebuLanguage = ZebuLanguageReturning<unknown>;

export function createLanguage(
  parserCore: Parser<unknown>,
  literals: string[]
): ZebuLanguage {
  function parser(strs: TemplateStringsArray, ...xs: unknown[]) {
    return parse(tokenize(strs.raw, xs, literals), parserCore);
  }
  parser.firstTokenOptions = parserCore.firstTokenOptions;
  parser.parse = (state: ParseSubject) => parserCore.parse(state);

  return parser;
}

export const lang = createLanguage(
  new Seq(
    (ast) => {
      const { parser, literals } = compile(ast);
      return createLanguage(parser, literals);
    },
    grammar,
    new Zero(() => null)
  ),
  rootLanguageLiterals
) as ZebuLanguageReturning<ZebuLanguage>;
