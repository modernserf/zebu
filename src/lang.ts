const nil = new Zero(() => null);
const seq1 = <In, Out>(fn: (left: In) => Out, parser: Parser<In>) =>
  new Seq((l, _) => fn(l), parser, nil);
const seq2 = <L, R, Out>(
  fn: (left: L, right: R) => Out,
  l: Parser<L>,
  r: Parser<R>
) => new Seq((l, r) => fn(l, r), l, r);
const mapRight = <In, Out>(
  fn: (right: In) => Out,
  left: Parser<unknown>,
  right: Parser<In>
) => new Seq((_, r) => fn(r), left, right);
const seq3 = <A, B, C, Out>(
  fn: (a: A, b: B, c: C) => Out,
  a: Parser<A>,
  b: Parser<B>,
  c: Parser<C>
): Parser<Out> => new SeqMany<Out>(fn, [a, b, c]);

const struct = <T>(startToken: StartToken, getParser: () => Parser<T>) =>
  new Structure(startToken, new Lazy(getParser));
const optional = <T>(parser: Parser<T>, getDefault: () => T) =>
  new Alt([parser, new Zero(getDefault)]);
const optNil = <T>(parser: Parser<T>) => new Alt([parser, nil]);
const emptyList = new Zero(() => []);
const optSepBy = <T>(
  valueParser: Parser<T>,
  separatorParser: Parser<unknown>
) => new Alt([new SepBy(valueParser, separatorParser), emptyList]);
const repeat1 = <T>(parser: Parser<T>) =>
  new Seq((h, t) => [h, ...t], parser, new Repeat(parser));

class ParserContext {
  private rules: Map<string, Parser<unknown>>;
  constructor() {
    this.rules = new Map()
      .set("identifier", ident)
      .set("value", value)
      .set("operator", new TokType("operator"));
  }
  // TODO: if i build rules in reverse, can i remove the lazy wrapper here?
  // otherwise, validate rules are referenced in correct order here
  get(key: string): Parser<unknown> {
    return new Lazy(() => {
      const p = this.rules.get(key);
      if (!p) throw new Error("unknown parser rule");
      return p;
    });
  }
  set(key: string, value: ParserWithContext): ParserContext {
    if (this.rules.has(key)) {
      throw new Error("duplicate key");
    }
    this.rules.set(key, value(this));
    return this;
  }
}

type ParserWithContext = (context: ParserContext) => Parser<unknown>;

const baseExpr = new Alt<ParserWithContext>([
  struct("(", () => altExpr),
  mapRight(
    (expr) => (context) => struct("(", () => expr(context)),
    hash,
    struct("(", () => altExpr)
  ),
  mapRight(
    (expr) => (context) => struct("[", () => expr(context)),
    hash,
    struct("[", () => altExpr)
  ),
  mapRight(
    (expr) => (context) => struct("{", () => expr(context)),
    hash,
    struct("{", () => altExpr)
  ),
  mapRight(
    (fn) => (context) => {
      if (typeof fn === "function") return fn(context);
      throw new Error("expected a function here");
    },
    new Literal("include"),
    value
  ),
  seq1(
    (ruleName) => (context) => {
      console.log("ruleName", ruleName);
      return context.get(ruleName);
    },
    ident
  ),
  seq1(
    (value) => () => {
      if (typeof value === "string") return new Literal(value);
      throw new Error("what else should we do here?");
    },
    value
  ),
]);

const repExpr = new Alt<ParserWithContext>([
  seq2(
    (expr) => (context) => new Repeat(expr(context)),
    baseExpr,
    new Literal("*")
  ),
  seq2(
    (expr) => (context) => repeat1(expr(context)),
    baseExpr,
    new Literal("+")
  ),
  seq2(
    (expr) => (context) => optNil(expr(context)),
    baseExpr,
    new Literal("?")
  ),
  baseExpr,
]);

const sepExpr = new Alt<ParserWithContext>([
  seq3(
    (expr, _, separator) => (context) =>
      sepBy(expr(context), separator(context)),
    repExpr,
    new Literal("++"),
    repExpr
  ),
  seq3(
    (expr, _, separator) => (context) =>
      optSepBy(expr(context), separator(context)),
    repExpr,
    new Literal("**"),
    repExpr
  ),
  repExpr,
]);

const seqExpr: Parser<ParserWithContext> = seq2(
  (exprs, fn) => (context) =>
    new SeqMany(
      fn as any,
      exprs.map((expr) => expr(context))
    ),
  repeat1(sepExpr),
  optional(
    mapRight(
      (x) => {
        if (typeof x === "function") return x;
        throw new Error("expected function for sequence");
      },
      new Literal(":"),
      value
    ),
    () => <T>(x: T) => x
  )
);

const altExpr: Parser<ParserWithContext> = seq1(
  (exprs) => (context) => new Alt(exprs.map((expr) => expr(context))),
  new SepBy(seqExpr, new Literal("|"))
);

const rule: Parser<ParserWithContext> = seq3(
  (name, _, expr) => (context) => expr(context.set(name, expr)),
  ident,
  new Literal("="),
  altExpr
);

const grammar = new Alt<Parser<unknown>>([
  seq1((rules) => {
    const context = new ParserContext();
    const firstRule = rules.map((rule) => rule(context)).shift();
    // istanbul ignore next
    if (!firstRule) throw new Error("empty rule set");
    return firstRule;
  }, new SepBy(rule, new Literal(";"))),
  seq1((p) => p(new ParserContext()), altExpr),
]);

export function lang(
  strs: TemplateStringsArray,
  ...interpolations: unknown[]
): (strs: TemplateStringsArray, ...xs: unknown[]) => unknown {
  const tokens = tokenize(strs.raw, interpolations);
  const parser = parse(tokens, grammar);
  return (strs: TemplateStringsArray, ...interpolations: unknown[]) => {
    return parse(tokenize(strs.raw, interpolations), parser);
  };
}
