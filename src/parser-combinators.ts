import { Token } from "./lexer";
import { brandEof, brandLiteral, brandType, Terminal } from "./parser-ll";

type RuleFrame = {
  type: "rule";
  name: symbol;
};

const brandToken = (token: Token | null) => {
  if (!token) return brandEof;
  if (token.type === "identifier" || token.type === "value") {
    return brandType(token.type);
  } else {
    return brandLiteral(token.value);
  }
};

type ParseErrorStackFrame = Token | RuleFrame;

class ParseError {
  // NOTE: load-bearing underscore
  // if an object with a property called `stack` is thrown in a Jest test
  // it will hang indefinitely!
  // see https://github.com/facebook/jest/issues/10681
  public _stack: ParseErrorStackFrame[] = [];
  constructor(public readonly message: string) {}
}

class MatchError extends ParseError {
  constructor(expected: string, received: Token | null) {
    super(`Expected ${expected}, received ${brandToken(received)}`);
    if (received) {
      this._stack.push(received);
    }
  }
}

export class ParseState {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  private results: unknown[] = [];
  next(): Token | null {
    return this.tokens[this.index++];
  }
  peek(): Token | null {
    return this.tokens[this.index] || null;
  }
  push(x: unknown): void {
    this.results.push(x);
  }
  reduce(arity: number, fn: (...xs: unknown[]) => unknown) {
    const args: unknown[] = [];
    for (let i = 0; i < arity; i++) {
      args.unshift(this.results.pop());
    }
    this.results.push(fn(...args));
  }
  done(): unknown {
    return this.results.pop();
  }
}

export interface Parser {
  parse(state: ParseState): void;
}

export class MatchType implements Parser {
  constructor(private type: "identifier" | "value") {}
  parse(state: ParseState): void {
    const token = state.next();
    if (!token || token.type !== this.type) {
      throw new MatchError(brandType(this.type), token);
    }
    state.push(token.value);
  }
}

export class MatchLiteral implements Parser {
  constructor(private value: string) {}
  parse(state: ParseState): void {
    const token = state.next();
    if (
      !token ||
      !["operator", "keyword"].includes(token.type) ||
      token.value !== this.value
    ) {
      throw new MatchError(brandLiteral(this.value), token);
    }
    state.push(token.value);
  }
}

export class MatchRule implements Parser {
  constructor(private parsers: Map<symbol, Parser>, private ruleName: symbol) {}
  parse(state: ParseState): void {
    try {
      this.parsers.get(this.ruleName)!.parse(state);
    } catch (e) {
      // istanbul ignore else
      if (e instanceof ParseError) {
        e._stack.push({ type: "rule", name: this.ruleName });
      }
      throw e;
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
    state.reduce(this.arity, this.fn || ((x) => x));
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
      throw new MatchError([...this.parserMap.keys()].join(), token);
    }
    parser.parse(state);
  }
}
