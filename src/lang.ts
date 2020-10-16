import { grammar, AST } from "./ast";
import { compile } from "./compiler";
import { tokenize } from "./lexer";
import { parse, Parser, Seq, Zero } from "./parser";

type Foo = {
  ast: AST;
  compile: () => void;
};
export type ZebuLanguageReturning<Type> = Foo &
  ((strs: TemplateStringsArray, ...xs: unknown[]) => Type);

export type ZebuLanguage = ZebuLanguageReturning<unknown>;

export function createLanguage(
  parserCore: Parser<unknown>,
  literals: string[]
): ZebuLanguage {
  function parser(strs: TemplateStringsArray, ...xs: unknown[]) {
    return parse(tokenize(strs.raw, xs, literals), parserCore);
  }
  parser.ast = null;
  parser.compile = () => undefined;

  return parser;
}

export function createLanguage2(ast: AST): ZebuLanguage {
  let compiled: { parser: Parser<unknown>; literals: string[] } | null;

  // this is lazy -- no compile errors until you try to build a language with it
  function parser(strs: TemplateStringsArray, ...xs: unknown[]) {
    if (!compiled) {
      compiled = compile(ast);
    }
    return parse(tokenize(strs.raw, xs, compiled.literals), compiled.parser);
  }
  parser.ast = ast;
  parser.compile = () => {
    compiled = compile(ast);
  };

  return parser;
}

export const rootLanguageLiterals = [
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  "#",
  ":",
  ";",
  ",",
  "+",
  "|",
  "=",
  "++",
  "**",
  "*",
  "?",
  "include",
  "value",
  "identifier",
  "operator",
  "keyword",
];

export const lang = createLanguage(
  new Seq(createLanguage2, grammar, new Zero(() => null)),
  rootLanguageLiterals
) as ZebuLanguageReturning<ZebuLanguage>;
