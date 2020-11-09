import { lang } from "../lang";

// prettier-ignore
export const dx = lang`
  Expr
    = SeqExpr "," Expr     : ${(l, _, r) => new Comma(l, r)}
    | SeqExpr;
  SeqExpr   
    = SeqExpr "|"? AltExpr : ${(l, _, r) => new Seq(l, r)}
    | AltExpr 
  AltExpr   
    = AltExpr "/" BaseExpr : ${(l, _, r) => new Alt(l, r)}
    | BaseExpr;
  BaseExpr  
    = #( Expr )
    | "."                           : ${() => new Identity()}
    | "." Key Opt                   : ${(_, key, opt) => new Field(key, opt)}
    | ".."                          : ${() => new Recur()}
    | "empty"                       : ${() => new Nil()}
    | "." #[ Slice ** "," ] Opt     : ${(_, s, opt) => new Slice(s, opt)}
    | "@" Pattern                   : ${(_, pat) => new Test(pat)}
    | "select" BaseExpr             : ${(_, expr) => new Select(expr)}
    | value;

  Key = identifier | keyword | value;
  Opt = "?"? : ${(x) => !!x};
  Slice 
    = value ":" value : ${(from, _, to) => ({ type: "range", from, to })} 
    | value           : ${(key) => ({ type: "key", key })};
  Pattern   
    = value                        : ${toTest}
    | #[(Pattern ** ",") PatRest?] : ${arrayTest}
    | #{ PatPair ** "," }          : ${(pairs) => toTest(fromPairs(pairs))};

  Pair = Key ":" SeqExpr           : ${(key, _, value) => [key, value]};
  PatPair = Key ":" Pattern        : ${(key, _, value) => [key, value]};
  PatRest = "..." Pattern          : ${(_, x) => x};
`;

type TestFn = (x: unknown) => boolean;
type UpdateFn = (x: unknown) => unknown;

abstract class Dx {
  test(subject) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of this.matches(subject)) {
      return true;
    }
    return false;
  }
  match(subject) {
    for (const match of this.matches(subject)) {
      return match;
    }
    return undefined;
  }
  abstract matches(subject: unknown): Generator<unknown>;
  abstract replace(subject: unknown, fn: UpdateFn): unknown;
}

class Nil extends Dx {
  *matches(_subject) {
    // noop
  }
  replace(subject, _fn: UpdateFn) {
    return subject;
  }
}

class Identity extends Dx {
  *matches(subject) {
    yield subject;
  }
  replace(subject, fn: UpdateFn) {
    return fn(subject);
  }
}

// TODO: make this work on object, array, map etc
class Field extends Dx {
  constructor(
    private readonly fieldName: string,
    private readonly optional: boolean
  ) {
    super();
  }
  *matches(subject) {
    if (this.fieldName in subject) {
      yield subject[this.fieldName];
    } else if (this.optional) {
      yield null;
    }
  }
  replace(subject, fn: UpdateFn) {
    if (this.fieldName in subject || this.optional) {
      return { ...subject, [this.fieldName]: fn(subject[this.fieldName]) };
    } else {
      return subject;
    }
  }
}

function toTest(pattern: unknown): TestFn {
  if (typeof pattern === "function") return pattern as TestFn;
  if (pattern && typeof pattern === "object") {
    return (value: any) => {
      for (const key in pattern) {
        if (!value || !(key in value) || !toTest(pattern[key])(value[key]))
          return false;
      }
      return true;
    };
  }
  return (value) => value === pattern;
}

function fromPairs(pairs: Array<[string, unknown]>) {
  const res = {};
  for (const [key, value] of pairs) {
    res[key] = value;
  }
  return res;
}

function arrayTest(heads: TestFn[], tail?: TestFn): TestFn {
  return (value: unknown[]) => {
    if (!Array.isArray(value)) return false;
    for (const [i, head] of heads.entries()) {
      if (value.length <= i) return false;
      if (!head(value[i])) return false;
    }
    if (tail) {
      for (let i = heads.length; i < value.length; i++) {
        if (!tail(value[i])) return false;
      }
    }
    return true;
  };
}

class Test extends Dx {
  constructor(private readonly testFn: (x: unknown) => boolean) {
    super();
  }
  *matches(subject) {
    if (this.testFn(subject)) {
      yield subject;
    }
  }
  replace(subject, fn: UpdateFn) {
    if (this.testFn(subject)) {
      return fn(subject);
    } else {
      return subject;
    }
  }
}

class Select extends Dx {
  constructor(private readonly dx: Dx) {
    super();
  }
  *matches(subject) {
    for (const result of this.dx.matches(subject)) {
      if (result) {
        yield subject;
        return;
      }
    }
  }
  replace(subject, fn: UpdateFn) {
    for (const result of this.dx.matches(subject)) {
      if (result) {
        return fn(subject);
      }
    }
    return subject;
  }
}

class Seq extends Dx {
  constructor(private readonly left: Dx, private readonly right: Dx) {
    super();
  }
  *matches(subject): Generator {
    for (const next of this.left.matches(subject)) {
      yield* this.right.matches(next);
    }
  }
  replace(subject, fn: UpdateFn) {
    return this.left.replace(subject, (value) => this.right.replace(value, fn));
  }
}

class Comma extends Dx {
  constructor(private readonly left: Dx, private readonly right: Dx) {
    super();
  }
  *matches(subject) {
    yield* this.left.matches(subject);
    yield* this.right.matches(subject);
  }
  replace(subject, fn: UpdateFn) {
    const next = this.left.replace(subject, fn);
    return this.right.replace(next, fn);
  }
}

class Alt extends Dx {
  constructor(private readonly left: Dx, private readonly right: Dx) {
    super();
  }
  *matches(subject) {
    let didMatch = false;
    for (const match of this.left.matches(subject)) {
      didMatch = true;
      yield match;
    }
    if (!didMatch) {
      yield* this.right.matches(subject);
    }
  }
  replace(subject, fn: UpdateFn) {
    let didMatch = false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of this.left.matches(subject)) {
      didMatch = true;
      break;
    }
    if (didMatch) {
      return this.left.replace(subject, fn);
    } else {
      return this.right.replace(subject, fn);
    }
  }
}

class Slice extends Dx {
  *matches(subject: any) {
    yield* subject.values();
  }
  replace(subject: any, fn: UpdateFn) {
    return subject.map(fn);
  }
}

class Recur extends Dx {
  *matches(rootSubject: any) {
    const visited = new WeakSet();
    function* inner(subject) {
      if (visited.has(subject)) return;
      yield subject;

      if (subject && typeof subject === "object") {
        visited.add(subject);
        for (const key in subject) {
          yield* inner(subject[key]);
        }
      }
    }

    yield* inner(rootSubject);
  }
  replace(initSubject: any, fn: UpdateFn) {
    const cache = new WeakMap();
    function inner(subject) {
      if (cache.has(subject)) return cache.get(subject)!;

      if (subject && typeof subject === "object") {
        const result = { ...subject };
        for (const key in subject) {
          result[key] = fn(inner(subject[key]));
        }
        cache.set(subject, result);
        return result;
      } else {
        return fn(subject);
      }
    }

    return inner(initSubject);
  }
}
