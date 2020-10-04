const atSubject = ({ tokens, index }: { tokens: Token[]; index: number }) => {
  const pre = tokens.slice(index - 3, index).join(" ");
  const post = tokens.slice(index + 1, index + 4).join(" ");
  const target = String(tokens[index] || "   ");
  return [
    "\n",
    pre,
    target,
    post,
    "\n",
    pre.replace(/./g, " "),
    target.replace(/./g, "^"),
    post.replace(/./g, " "),
  ];
};

type Expect = any; // FIXME

interface Errorish {
  message: string;
  ok: boolean;
}

type TokenValue = any; // FIXME

interface Token {
  type: string;
  value: TokenValue;
  startToken?: string;
  endToken?: string;
}

interface Subject {
  tokens: Token[];
  index: number;
}

// NOTE: stack traces are basically useless here, so not a "real" error
// This makes tests run dramatically faster
class TracedParserError implements Errorish {
  public readonly ok = false;
  constructor(
    public readonly ownMessage: string,
    public readonly subject: Subject
  ) {}
  get message() {
    return `${this.ownMessage}: ${atSubject(this.subject)}`;
  }
}

class LeftoverTokensError extends TracedParserError {
  constructor(subject: Subject) {
    super(`Leftover tokens`, subject);
  }
}

class UnexpectedEndOfInputError extends TracedParserError {
  constructor(subject: Subject) {
    super(`Unexpected end of input`, subject);
  }
}

class TokenTypeError extends TracedParserError {
  constructor(type: string, subject: Subject) {
    super(`Expected ${atIndex(subject)} to have type ${type}`, subject);
  }
}

class TokenValueError extends TracedParserError {
  constructor(value: string, subject: Subject) {
    super(`Expected ${atIndex(subject)} to have value "${value}"`, subject);
  }
}

class NotAStructureError extends TracedParserError {
  constructor(subject: Subject) {
    super(`Expected a structure`, subject);
  }
}

class WrongStructureType extends TracedParserError {
  constructor(start: string, end: string, subject: Subject) {
    super(`Expected a structure wrapped with "${start}" & "${end}"`, subject);
  }
}

class AltsError {
  public message: string;
  public readonly ok = false;
  constructor(errors: Errorish[]) {
    this.message = [
      "All failed: ",
      ...errors.map((err) => err && err.message),
    ].join("\n");
  }
}

class NotEnoughItemsError extends TracedParserError {
  constructor(parser: Parser, min: number, subject: Subject) {
    super(`Expected at least ${min} items`, subject);
  }
}
/**
 * mock interface for token
 */
const $t = (type: string, value: any = null) => ({ type, value });

class ParseSubject {
  constructor(public readonly tokens: Token[], public readonly index: number) {}
}

type ParserNode = any; // FIXME

class ParserOutput {
  public readonly ok = true;
  constructor(
    public readonly node: ParserNode,
    public readonly index: number
  ) {}
}

const output = (node: ParserNode, index: number) =>
  new ParserOutput(node, index);
const update = (subject: Subject, output: ParserOutput) =>
  new ParseSubject(subject.tokens, output.index);
const atIndex = (subject: Subject) => subject.tokens[subject.index];

type IParserOutput =
  | ({
      ok: false;
    } & Errorish)
  | ({
      ok: true;
    } & ParserOutput);

export interface Parser {
  parse(subject: Subject): IParserOutput;
}

class LazyParser implements Parser {
  private memo: Parser | null = null;
  constructor(private readonly thunk: () => Parser) {}
  parse(subject: ParseSubject) {
    if (this.memo === null) {
      this.memo = this.thunk();
    }
    return this.memo.parse(subject);
  }
}

export function test_LazyParser(expect: Expect) {
  const Expr: Parser = new LazyParser(() =>
    alt(
      seq((_: any, x: number) => x, lit("("), Expr, lit(")")),
      seq((_: any, x: number) => -x, lit("-"), Expr),
      token("number")
    )
  );
  // -(-(123))
  const tokens = [
    $t("token", "-"),
    $t("token", "("),
    $t("token", "-"),
    $t("token", "("),
    $t("number", 123),
    $t("token", ")"),
    $t("token", ")"),
  ];
  expect(parse(Expr, tokens)).toEqual(123);
}

/**
 * consumes no input, always succeeds
 */
export const nil = {
  parse: ({ index }: { index: number }) => output(undefined, index),
};

export function test_nil_matches_an_empty_sequence(expect: Expect) {
  expect(parse(nil, [])).toEqual(undefined);
  expect(() => {
    parse(nil, [$t("foo")]);
  }).toThrow();
}

class TokenParser implements Parser {
  constructor(private readonly expected: string) {}
  parse(subject: Subject) {
    const token = atIndex(subject);
    if (!token) {
      return new UnexpectedEndOfInputError(subject);
    }
    if (token.type !== this.expected) {
      return new TokenTypeError(this.expected, subject);
    }
    return output(atIndex(subject).value, subject.index + 1);
  }
}

/**
 * matches if token.type === type.
 */
export const token = (type: string) => new TokenParser(type);

export function test_token_matches_a_type(expect: Expect) {
  expect(parse(token("foo"), [{ type: "foo", value: 1 }])).toEqual(1);
  expect(() => {
    parse(token("foo"), [{ type: "bar", value: undefined }]);
  }).toThrow();
}

class LiteralParser implements Parser {
  constructor(private readonly tokenValue: string) {}
  get expected() {
    return `"${this.tokenValue}"`;
  }
  parse(subject: Subject) {
    const token = atIndex(subject);
    if (!token) {
      return new UnexpectedEndOfInputError(subject);
    }
    if (token.type === "value") {
      return new TokenTypeError("line, identifier or operatror", subject);
    }
    if (token.value !== this.tokenValue) {
      return new TokenValueError(this.tokenValue, subject);
    }
    return output(atIndex(subject).value, subject.index + 1);
  }
}

/**
 * matches if token.value === string, and token is not itself a string.
 */
export const lit = (value: string) => new LiteralParser(value);

export function test_lit_matches_values(expect: Expect) {
  const parser = lit("(");
  const tokens = [$t("structure", "(")];
  expect(parse(parser, tokens)).toEqual("(");
}

// FIXME
const QUOTE = Symbol("QUOTE");
const quote = (fn: any, values: any[]) => ({
  [QUOTE]: () => unquote(fn)(...values.map(unquote)),
});
const unquote = (x: any) => (x && x[QUOTE] ? x[QUOTE]() : x);

class SeqParser implements Parser {
  constructor(
    private readonly mapFn: any, // FIXME
    private readonly parsers: Parser[]
  ) {}
  parse(subject: Subject) {
    const out = [];
    for (const p of this.parsers) {
      if (!p.parse) {
        console.warn("not a parser:", p, subject);
      }
      const res = p.parse(subject);
      if (!res.ok) {
        return res;
      }
      out.push(res.node);
      subject = update(subject, res);
    }
    return output(quote(this.mapFn, out), subject.index);
  }
}

/**
 * matches if each in a sequence of parsers matches.
 * outputs mapFn(subject, ...outputs).
 */
export const seq = (mapFn: any, ...parsers: Parser[]) =>
  new SeqParser(mapFn, parsers);

export function test_seq_matches_a_sequence(expect: Expect) {
  const parser = seq(
    (_: any, value: any) => value,
    lit("("),
    token("foo"),
    lit(")")
  );
  const tokens = [$t("structure", "("), $t("foo", 1), $t("structure", ")")];
  expect(parse(parser, tokens)).toEqual(1);
}

class AltParser implements Parser {
  constructor(private readonly parsers: Parser[]) {}
  parse(subject: Subject) {
    let errors: Errorish[] = [];
    for (const p of this.parsers) {
      if (!p.parse) {
        console.warn("not a parser", [p], "end");
      }
      const res = p.parse(subject);
      if (res.ok === true) {
        return res;
      }
      // TODO: is this right?
      errors.push(res);
    }
    return new AltsError(errors);
  }
}

/**
 * matches if any of the parsers match.
 * outputs the output of the first parser that matches.
 * @param  {...Parser} parsers
 */
export const alt = (...parsers: Parser[]) =>
  parsers.length > 1 ? new AltParser(parsers) : parsers[0];

export function test_alt_matches_one_of_options(expect: Expect) {
  const parser = alt(token("foo"), token("bar"));
  expect(parse(parser, [$t("foo", 1)])).toEqual(1);
  expect(parse(parser, [$t("bar", 2)])).toEqual(2);
}

class RepeatParser implements Parser {
  constructor(
    private readonly parser: Parser,
    private readonly min: number,
    private readonly max: number
  ) {}
  parse(subject: Subject) {
    const out = [];
    while (subject.index < subject.tokens.length && out.length < this.max) {
      const res = this.parser.parse(subject);
      if (!res.ok) {
        break;
      }
      out.push(res.node);
      subject = update(subject, res);
    }
    if (out.length < this.min) {
      return new NotEnoughItemsError(this.parser, this.min, subject);
    }
    return output(
      quote((...xs: any[]) => xs, out),
      subject.index
    );
  }
}

/**
 * matches parser repeatedly until it fails, runs out of input,
 * or it reaches its maximum number of matches.
 * outputs an array of each iteration's output.
 * @param {Parser} parser
 * @param {number} min minimum number of matches required
 * @param {number} max maximum number of matches before giving up
 */
export const repeat = (parser: Parser, min = 0, max = Infinity) =>
  new RepeatParser(parser, min, max);

export function test_repeat(expect: Expect) {
  const tokens = [
    $t("identifier", "x"),
    $t("identifier", "y"),
    $t("identifier", "z"),
    $t("foo"),
  ];
  const parser = seq((x: any) => x, repeat(token("identifier")), token("foo"));
  expect(parse(parser, tokens)).toEqual(["x", "y", "z"]);
}

/**
 * match a sequence of valueParser, separated by separatorParser,
 * e.g. a comma-separated list.
 * outputs an array of each valueParser's output.
 * @param {Parser} valueParser
 * @param {Parser} separatorParser
 * @param {number} min number of repetitions
 * @param {number} max
 */
export const sepBy = (
  valueParser: Parser,
  separatorParser: Parser,
  min?: number,
  max?: number
) =>
  seq(
    (head: any, tail: any[]) => [head, ...tail],
    valueParser,
    repeat(
      seq((_: any, x: any) => x, separatorParser, valueParser),
      min,
      max
    )
  );

export function test_sepBy(expect: Expect) {
  const tokens = [
    $t("identifier", "x"),
    $t("bar"),
    $t("identifier", "y"),
    $t("bar"),
    $t("identifier", "z"),
  ];
  const parser = sepBy(token("identifier"), token("bar"));
  expect(parse(parser, tokens)).toEqual(["x", "y", "z"]);
}

const _2 = <T>(_: any, x: T) => x;
class WrappedWithParser implements Parser {
  private readonly content: Parser;
  constructor(
    private readonly start: string,
    getContent: () => Parser,
    private readonly end: string,
    private readonly mapFn: any
  ) {
    this.content = new LazyParser(getContent);
  }
  parse(subject: Subject) {
    const token = atIndex(subject);
    if (!token) {
      return new UnexpectedEndOfInputError(subject);
    }
    if (token.type !== "structure") {
      return new NotAStructureError(subject);
    }

    if (this.start === token.startToken && this.end === token.endToken) {
      const innerSubject = new ParseSubject(token.value, 0);
      const res = this.content.parse(innerSubject);
      if (!res.ok) {
        return res;
      }
      if (res.index !== token.value.length) {
        return new LeftoverTokensError(innerSubject);
      }
      return output(res.node, subject.index + 1);
    }
    return new WrongStructureType(this.start, this.end, subject);
  }
}

export const wrappedWith = (
  left: string,
  getContent: () => Parser,
  right: string,
  mapFn = _2
) => new WrappedWithParser(left, getContent, right, mapFn);

export function test_wrappedWith(expect: Expect) {
  const tokens = [
    {
      type: "structure",
      value: [$t("identifier", "foo")],
      startToken: "(",
      endToken: ")",
    },
  ];
  const parser = wrappedWith("(", () => token("identifier"), ")");
  expect(parse(parser, tokens)).toEqual("foo");
}

const line = token("line");
export const padded = (parser: Parser) =>
  seq((_: any, x: any) => x, alt(line, nil), parser, alt(line, nil));

/**
 * Parse a stream of tokens, and return the output.
 */
export function parse(parser: Parser, tokens: Token[]) {
  const subject = new ParseSubject(tokens, 0);
  const res = parser.parse(subject);
  if (res.ok === false) {
    const err = new Error(res.message);
    err.name = res.constructor.name;
    throw err;
  }
  if (res.index !== tokens.length) {
    throw new LeftoverTokensError(subject);
  }
  return unquote(res.node);
}
