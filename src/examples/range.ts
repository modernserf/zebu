/*
import { lang } from "../lang";

// prettier-ignore
export const range = lang`
  SubsetExpr 
    = SubsetExpr "&" ConcatExpr : ${(b, _, f) => new Subset(b, f)}
    | ConcatExpr;  
  ConcatExpr  
    = ConcatExpr ";" BaseExpr : ${(l, _, r) => new Concat(l, r)}
    | BaseExpr;
  BaseExpr = 
    #( Expr ) 
    | StartRange "..." EndRange? : ${(l, _, r) => Span.fromArgs(l, r)}
    | value : ${(x) => Value.from(x)}
    | "nil" : ${() => Nil};

  SpanEnd 
    = value "," value : ${(start, _, next) => ({ start, next })};
    | value           : ${(start) => ({ start, next: null})};
    | nil         
  EndRange = Excluding value : ${(excluding, end) => ({ excluding, end })};
  Excluding = "including" | "excluding" | nil : ${(x) => x === "excluding"};
`;

abstract class Range<T> {
  abstract has(value: T): boolean;
  abstract [Symbol.iterator](): Generator<T>;
}

const Nil: Range<unknown> = {
  has(_value: unknown) {
    return false;
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  *[Symbol.iterator]() {},
};

class Value<T> extends Range<T> {
  constructor(private readonly value: T) {
    super();
  }
  static from<T extends unknown>(x: T): Range<unknown> {
    if (x instanceof Range) {
      return x as Range<unknown>;
    }
    if (Symbol.iterator in x) {
      return new IterRange(x[Symbol.iterator]);
    }
    return new Value(x);
  }
  has(value: T) {
    return value === this.value;
  }
  *[Symbol.iterator]() {
    yield this.value;
  }
}

class IterRange<T> extends Range<T> {
  cache = new Set<T>();
  constructor(private readonly value: Iterable<T>) {
    super();
    this.cache = new Set(value);
  }
  has(value: T) {
    return this.cache.has(value);
  }
  *[Symbol.iterator]() {
    yield* this.value;
  }
}

interface SpanInner<T> {
  first: T;
  next(prev: T): T;
  beforeEnd(value: T): boolean;
  afterBeginning(value: T): boolean;
}

type SpanEnd =
  | { type: "open" }
  | { type: "value"; value: number }
  | { type: "interval"; first: number; next: number };

function agreeOrDefault<T>(xs: T[], defaultValue: T, error: Error) {
  if (!xs.length) return defaultValue;
  return xs.reduce((l, r) => {
    if (l !== r) {
      throw error;
    }
    return l;
  });
}

class Span<T> extends Range<T> {
  static fromArgs(
    start: SpanEnd,
    end: SpanEnd,
    includeStart: boolean,
    includeEnd: boolean
  ) {
    const isPositiveArr: boolean[] = [];
    const intervalArr: number[] = [];
    if (start.type === "interval") {
      isPositiveArr.push(start.next > start.first);
      intervalArr.push(start.next - start.first);
    }
    if (end.type === "interval") {
      isPositiveArr.push(end.next > end.first);
      intervalArr.push(end.next - end.first);
    }
    if (start.type !== "open" && end.type !== "open") {
      isPositiveArr.push(end.value > start.value);
    }
    const isPositive = agreeOrDefault(
      isPositiveArr,
      true,
      new Error("inconsistent iteration direction")
    );

    const interval = agreeOrDefault(
      intervalArr,
      isPositive ? 1 : -1,
      new Error("inconsistent interval")
    );
  }
  constructor(private inner: SpanInner<T>) {
    super();
  }
  has(value: T) {
    return this.inner.beforeEnd(value) && this.inner.afterBeginning(value);
  }
  *[Symbol.iterator]() {
    let current = this.inner.first;
    while (this.inner.beforeEnd(current)) {
      yield current;
      current = this.inner.next(current);
    }
  }
}

class NumberRange implements SpanInner<number> {
  constructor(
    public readonly first: number,
    private readonly last: number,
    private readonly interval: number,
    private readonly excludeEnd: boolean
  ) {}
  beforeEnd(value: number) {
    if (this.interval > 0) {
      if (this.excludeEnd) {
        return value < this.last;
      } else {
        return value <= this.last;
      }
    } else {
      if (this.excludeEnd) {
        return value > this.last;
      } else {
        return value >= this.last;
      }
    }
  }
  afterBeginning(value: number) {
    if (this.interval > 0) {
      return this.first <= value;
    } else {
      return this.first >= value;
    }
  }
  next(value: number) {
    return value + this.interval;
  }
}

class Concat<T> extends Range<T> {
  constructor(
    private readonly left: Range<T>,
    private readonly right: Range<T>
  ) {
    super();
  }
  has(value: T) {
    return this.left.has(value) || this.right.has(value);
  }
  *[Symbol.iterator]() {
    yield* this.left;
    yield* this.right;
  }
}

class Subset<T> extends Range<T> {
  constructor(
    private readonly base: Range<T>,
    private readonly filter: Range<T>
  ) {
    super();
  }
  has(value: T) {
    return this.base.has(value) && this.filter.has(value);
  }
  *[Symbol.iterator]() {
    for (const item of this.base) {
      if (this.filter.has(item)) {
        yield item;
      }
    }
  }
}
*/
