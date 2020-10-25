import { coreAST, AST } from "./core";
import { createParser } from "./parser-ll";

export type ZebuLanguageReturning<Type> = {
  ast: AST;
  compile: () => void;
} & TemplateStringParser<Type>;

type TemplateStringParser<Type> = (
  strs: TemplateStringsArray,
  ...xs: unknown[]
) => Type;
export type ZebuLanguage = ZebuLanguageReturning<unknown>;

export function createLanguage<T>(ast: AST): TemplateStringParser<T> {
  let parser: TemplateStringParser<T> | null = null;
  function wrappedParser(strs: TemplateStringsArray, ...xs: unknown[]): T {
    if (!parser) {
      wrappedParser.compile();
    }
    return parser!(strs, ...xs);
  }
  wrappedParser.ast = ast;
  wrappedParser.compile = () => {
    parser = createParser(ast);
  };
  return wrappedParser;
}

const coreParser = createParser(coreAST) as TemplateStringParser<AST>;
``;
export const lang = ((strs: TemplateStringsArray, ...xs: unknown[]) => {
  const langAST = coreParser(strs, ...xs);
  return createLanguage(langAST);
}) as ZebuLanguageReturning<ZebuLanguage>;
