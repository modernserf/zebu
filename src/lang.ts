import { coreAST, AST } from "./core";
import { createParser } from "./parser-ll";

type Foo = {
  ast: AST;
  compile: () => void;
};
export type ZebuLanguageReturning<Type> = Foo &
  ((strs: TemplateStringsArray, ...xs: unknown[]) => Type);

export type ZebuLanguage = ZebuLanguageReturning<unknown>;

const coreParser = createParser(coreAST) as (
  strs: TemplateStringsArray,
  ...xs: unknown[]
) => AST;

export const lang = ((strs: TemplateStringsArray, ...xs: unknown[]) => {
  const langAST = coreParser(strs, ...xs);
  let parser: any | null = null;

  function wrappedParser(strs: TemplateStringsArray, ...xs: unknown[]) {
    if (!parser) wrappedParser.compile();
    return parser(strs, ...xs);
  }
  wrappedParser.ast = langAST;
  wrappedParser.compile = () => {
    parser = createParser(langAST);
  };

  return wrappedParser;
}) as ZebuLanguageReturning<ZebuLanguage>;
