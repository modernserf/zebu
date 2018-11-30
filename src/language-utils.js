import { parse } from './parse-utils'
import { tokenize } from './token-utils'

/**
 * @typedef {(strs: string[], ...any) => any} TaggedTemplateString
 * @param {import('./token-utils').Tokenizer} tokenizer
 * @param {import('./parse-utils').Parser} parser
 * @returns TaggedTemplateString
 */
export const createLanguage = ({ tokenizer, parser }) => {
  const tts = (strs, ...interpolations) => {
    const tokens = Array.from(tokenize(tokenizer, strs, interpolations))
    return parse(parser, tokens)
  }
  // attach parser props to tts
  Object.assign(tts, parser)
  return tts
}

export const createMetalanguage = ({ getTokenizer, parser, literals }) => {
  const compileGrammar = createLanguage({
    parser,
    tokenizer: getTokenizer(literals),
  })
  const lang = (strs, ...interpolations) => {
    const parser = compileGrammar(strs, ...interpolations)
    const tokenizer = getTokenizer(parser.literals || [])
    return createLanguage({ parser, tokenizer })
  }
  lang.withConfig = options => (strs, ...interpolations) =>
    createLanguage({
      parser: compileGrammar(strs, ...interpolations),
      ...options,
    })
  return lang
}
