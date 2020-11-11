import { Token } from './lexer';
import { TokenPosition } from './util';

type Brand<K, T> = K & { __brand: T };
export type Terminal = Brand<string, 'Terminal'>;
export const brandLiteral = (value: string) => `"${value}"` as Terminal;
export const brandType = (type: string) => `<${type}>` as Terminal;
export const brandEof = '(end of input)' as Terminal;

type EofToken = {
  type: 'eof';
  index: number;
  outerIndex: number;
  length: number;
};

const brandToken = (token: Token | EofToken) => {
  if (token.type === 'eof') return brandEof;
  if (token.type === 'identifier' || token.type === 'value') {
    return brandType(token.type);
  } else {
    return brandLiteral(token.value);
  }
};

export class InternalParseError {
  constructor(
    public readonly message: string,
    public readonly pos: TokenPosition
  ) {}
}

class MatchError extends InternalParseError {
  constructor(expected: string, received: Token | EofToken) {
    super(`Expected ${expected}, received ${brandToken(received)}`, received);
  }
}

class RuleError extends InternalParseError {
  constructor(ruleName: string, prev: InternalParseError) {
    super(`${prev.message}\n  in ${ruleName}`, prev.pos);
  }
}

export class ParseState {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  private results: unknown[] = [];
  next(): Token | EofToken {
    return this.tokens[this.index++] || this.eofToken();
  }
  peek(): Token | EofToken {
    return this.tokens[this.index] || this.eofToken();
  }
  push(x: unknown): void {
    this.results.push(x);
  }
  reduce(arity: number, fn: (...xs: unknown[]) => unknown): void {
    const args: unknown[] = [];
    for (let i = 0; i < arity; i++) {
      args.unshift(this.results.pop());
    }
    this.results.push(fn(...args));
  }
  done(): unknown {
    if (this.index === this.tokens.length) {
      return this.results.pop();
    } else {
      throw new MatchError('end of input', this.peek());
    }
  }
  private eofToken(): EofToken {
    const lastToken = this.tokens[this.tokens.length - 1];
    return lastToken
      ? {
          type: 'eof',
          index: lastToken.index + 1,
          outerIndex: lastToken.outerIndex,
          length: 0,
        }
      : { type: 'eof', index: 0, outerIndex: 0, length: 0 };
  }
}

export interface Parser {
  parse(state: ParseState): void;
}

export class MatchType implements Parser {
  constructor(private type: 'identifier' | 'value') {}
  parse(state: ParseState): void {
    const token = state.next();
    if (token.type !== this.type) {
      throw new MatchError(brandType(this.type), token);
    }
    state.push(token.value);
  }
}

export class MatchLiteral implements Parser {
  constructor(private value: string) {}
  parse(state: ParseState): void {
    const token = state.next();
    if (token.type === 'literal' && token.value === this.value) {
      state.push(token.value);
    } else {
      throw new MatchError(brandLiteral(this.value), token);
    }
  }
}

export class MatchRule implements Parser {
  constructor(private parsers: Map<symbol, Parser>, private ruleName: symbol) {}
  parse(state: ParseState): void {
    try {
      this.parsers.get(this.ruleName)!.parse(state);
    } catch (e) {
      // istanbul ignore else
      if (e instanceof InternalParseError) {
        throw new RuleError(this.ruleName.description || '(anonymous)', e);
      } else {
        throw e;
      }
    }
  }
}

type SeqFn = (...xs: unknown[]) => unknown;

export class Seq implements Parser {
  constructor(private parsers: Parser[]) {}
  parse(state: ParseState): void {
    for (const parser of this.parsers) {
      parser.parse(state);
    }
  }
}

export class Reduce implements Parser {
  constructor(private arity: number, private fn: SeqFn | null) {}
  parse(state: ParseState): void {
    state.reduce(this.arity, this.fn || (x => x));
  }
}

export class Alt implements Parser {
  constructor(private parserMap: Map<Terminal, Parser>) {}
  parse(state: ParseState): void {
    const token = state.peek();
    let parser = this.parserMap.get(brandToken(token));
    if (!parser) {
      parser = this.parserMap.get(brandEof);
    }
    if (!parser) {
      throw new MatchError(
        'one of ' + [...this.parserMap.keys()].join(),
        token
      );
    }
    parser.parse(state);
  }
}
