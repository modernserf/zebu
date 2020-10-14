import { Token } from "./lexer";

type Brand<K, T> = K & { __brand: T };

export class ParseSubject {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  next(): Token | null {
    return this.tokens[this.index++] || null;
  }
  peek(): Token | null {
    return this.tokens[this.index] || null;
  }
  done(): boolean {
    return this.index === this.tokens.length;
  }
  save(): <T>(message: string) => ParseOutput<T> {
    const oldIndex = this.index;
    return <T>(message: string): ParseOutput<T> => {
      this.index = oldIndex;
      // TODO: error should contain token info
      return { type: "error", message };
    };
  }
}

function union<T>(l: Set<T>, r: Set<T>): Set<T> {
  return new Set([...l, ...r]);
}

type ParseOutput<T> =
  | {
      type: "value";
      value: T;
    }
  | {
      type: "error";
      message: string;
    };

function ok<T>(value: T): ParseOutput<T> {
  return { type: "value", value };
}

export interface Parser<T> {
  parse(subject: ParseSubject): ParseOutput<T>;
  firstTokenOptions: FirstTokenOptions;
}

type FirstTokenOption = Brand<string, "FirstTokenOption">;
type FirstTokenOptions = Set<FirstTokenOption | null>;
const brandLiteral = (value: string) => `literal-${value}` as FirstTokenOption;
const brandType = (type: string) => `type-${type}` as FirstTokenOption;

type LiteralToken = Token & { value: string };

// TODO: remove 'identifier'
function isLiteral(token: Token): token is LiteralToken {
  return (
    token.type === "identifier" ||
    token.type === "keyword" ||
    token.type === "operator"
  );
}

type CandidateMap<T> = Map<FirstTokenOption | null, Parser<T>[]>;
function buildCandidateMap<T>(parsers: Parser<T>[]): CandidateMap<T> {
  const map = new Map();
  for (const parser of parsers) {
    for (const option of parser.firstTokenOptions) {
      if (option === null && map.has(null)) {
        throw new Error("Only one parser can match null");
      }
      const arr = map.get(option) || [];
      arr.push(parser);
      map.set(option, arr);
    }
  }
  return map;
}

function pushMapItems<K, V>(arr: V[], map: Map<K, V[]>, key: K) {
  const items = map.get(key);
  if (items) arr.push(...items);
}

function candidatesForToken<T>(
  map: CandidateMap<T>,
  token: Token | null
): Parser<T>[] {
  if (!token) {
    return map.get(null) || [];
  }

  const candidates = [];

  if (isLiteral(token)) {
    pushMapItems(candidates, map, brandLiteral(token.value));
    pushMapItems(candidates, map, brandType(token.type));
  } else {
    pushMapItems(candidates, map, brandType(token.type));
  }

  pushMapItems(candidates, map, null);

  return candidates;
}

// matches zero tokens
export class Zero<T> implements Parser<T> {
  firstTokenOptions = new Set([null]);
  constructor(private readonly getValue: () => T) {}
  parse(_subject: ParseSubject): ParseOutput<T> {
    return ok(this.getValue());
  }
}

// matches one token
export class Literal implements Parser<string> {
  firstTokenOptions: FirstTokenOptions;
  constructor(private readonly value: string) {
    this.firstTokenOptions = new Set([brandLiteral(value)]);
  }
  parse(subject: ParseSubject): ParseOutput<string> {
    const err = subject.save();
    const tok = subject.next();
    if (!tok) return err("eof");
    if (!isLiteral(tok)) {
      return err("not a literal");
    }
    if (tok.value !== this.value) {
      return err(`no match for ${this.value}`);
    }
    return ok(this.value);
  }
}

type TokenType = Token["type"];
type ValueForType<MyObject, Type> = MyObject extends {
  type: Type;
  value: unknown;
}
  ? MyObject["value"]
  : never;

export class TokType<Type extends TokenType>
  implements Parser<ValueForType<Token, Type>> {
  firstTokenOptions: FirstTokenOptions;
  constructor(private readonly type: Type) {
    this.firstTokenOptions = new Set([brandType(type)]);
  }
  parse(subject: ParseSubject): ParseOutput<ValueForType<Token, Type>> {
    const err = subject.save();
    const tok = subject.next();
    if (!tok) return err("eof");
    if (tok.type !== this.type) return err(`not a ${this.type}`);
    return ok(tok.value as ValueForType<Token, Type>);
  }
}

// matches multiple tokens

// TODO: fn arg (here and in SeqMany) accepts `trace((info, l, r) => ...)`
// where `info` contains info from parse subject
export class Seq<L, R, Out> implements Parser<Out> {
  firstTokenOptions: FirstTokenOptions;
  constructor(
    private readonly fn: (left: L, right: R) => Out,
    private readonly left: Parser<L>,
    private readonly right: Parser<R>
  ) {
    if (left.firstTokenOptions.has(null)) {
      const withoutNull = new Set([...left.firstTokenOptions]);
      withoutNull.delete(null);
      this.firstTokenOptions = union(withoutNull, right.firstTokenOptions);
    } else {
      this.firstTokenOptions = left.firstTokenOptions;
    }
  }
  parse(subject: ParseSubject): ParseOutput<Out> {
    const err = subject.save();
    const leftResult = this.left.parse(subject);
    if (leftResult.type === "error") {
      return leftResult;
    }
    const rightResult = this.right.parse(subject);
    if (rightResult.type === "error") {
      return err(rightResult.message);
    }
    return ok(this.fn(leftResult.value, rightResult.value));
  }
}

// TODO: can we type this correctly?
export class SeqMany<T> implements Parser<T> {
  firstTokenOptions: FirstTokenOptions;
  constructor(
    private readonly fn: (...xs: unknown[]) => T,
    private readonly parsers: Parser<unknown>[]
  ) {
    this.firstTokenOptions = new Set([null]);

    for (const p of parsers) {
      if (!this.firstTokenOptions.has(null)) break;

      const withoutNull = new Set([...this.firstTokenOptions]);
      withoutNull.delete(null);
      this.firstTokenOptions = union(withoutNull, p.firstTokenOptions);
    }
  }
  parse(subject: ParseSubject): ParseOutput<T> {
    const err = subject.save();
    const results: unknown[] = [];
    for (const p of this.parsers) {
      const result = p.parse(subject);
      if (result.type === "error") {
        return err(result.message);
      }
      results.push(result.value);
    }
    return ok(this.fn(...results));
  }
}

export class Alt<T> implements Parser<T> {
  firstTokenOptions: FirstTokenOptions;
  private readonly parserMap: CandidateMap<T>;
  constructor(parsers: Parser<T>[]) {
    this.parserMap = buildCandidateMap(parsers);
    this.firstTokenOptions = parsers.reduce(
      (set, p) => union(set, p.firstTokenOptions),
      new Set() as FirstTokenOptions
    );
  }
  parse(subject: ParseSubject): ParseOutput<T> {
    const err = subject.save();
    const firstToken = subject.peek();
    const candidates = candidatesForToken(this.parserMap, firstToken);

    for (const parser of candidates) {
      const result = parser.parse(subject);
      if (result.type === "value") return result;
    }

    return err("no match for any parser");
  }
}

export class Repeat<T> implements Parser<T[]> {
  firstTokenOptions: FirstTokenOptions;
  constructor(private readonly parser: Parser<T>) {
    if (parser.firstTokenOptions.has(null)) {
      throw new Error("repeating parser cannot match null");
    }
    this.firstTokenOptions = union(parser.firstTokenOptions, new Set([null]));
  }
  parse(subject: ParseSubject): ParseOutput<T[]> {
    const results: T[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = this.parser.parse(subject);
      if (result.type === "error") {
        break;
      }
      results.push(result.value);
    }
    return ok(results);
  }
}

export class SepBy<T> implements Parser<T[]> {
  firstTokenOptions: FirstTokenOptions;
  constructor(
    private readonly parser: Parser<T>,
    private readonly separator: Parser<unknown>
  ) {
    if (parser.firstTokenOptions.has(null)) {
      throw new Error("SepBy parser cannot match null");
    }
    if (separator.firstTokenOptions.has(null)) {
      throw new Error("separator cannot match null");
    }
    this.firstTokenOptions = parser.firstTokenOptions;
  }
  parse(subject: ParseSubject): ParseOutput<T[]> {
    const firstResult = this.parser.parse(subject);
    if (firstResult.type === "error") return firstResult;
    const results = [firstResult.value];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.separator.parse(subject).type === "error") break;

      const result = this.parser.parse(subject);
      if (result.type === "error") {
        break;
      }
      results.push(result.value);
    }
    return ok(results);
  }
}

export class Lazy<T> implements Parser<T> {
  private parser: Parser<T>;
  constructor(private readonly getParser: () => Parser<T>) {}
  get firstTokenOptions(): FirstTokenOptions {
    if (!this.parser) {
      this.parser = this.getParser();
    }
    return this.parser.firstTokenOptions;
  }
  parse(subject: ParseSubject): ParseOutput<T> {
    if (!this.parser) {
      this.parser = this.getParser();
    }
    return this.parser.parse(subject);
  }
}

export function parse<T>(tokens: Token[], parser: Parser<T>): T {
  const subject = new ParseSubject(tokens);
  const result = parser.parse(subject);
  if (result.type === "error") {
    throw new Error(result.message);
  }
  if (!subject.done()) {
    throw new Error("not done");
  }
  return result.value;
}
