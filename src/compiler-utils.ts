import { seq, parse, padded } from "./parse-utils";
import { tokenize } from "./token-utils";

const DROP = {};
const notDropped = (x) => x !== DROP;
export const drop = (parser) => seq(() => DROP, parser);
export const tag = (type) => (...values) => [
  type,
  ...values.filter(notDropped),
];

export function createCompiler(model) {
  return (ast) => {
    const ctx = {
      scope: {},
      usedTerminals: {},
      eval: ([type, ...payload]) => model[type](...payload, ctx),
    };
    return ctx.eval(ast);
  };
}

export function createTTS(parser) {
  const childTTS = (strings, ...interpolations) => {
    const tokens = Array.from(tokenize(strings.raw, interpolations));
    return parse(padded(parser), tokens);
  };
  childTTS.parse = (subject) => parser.parse(subject);
  return childTTS;
}
