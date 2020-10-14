import {
  Parser,
  Alt,
  Literal,
  TokType,
  Zero,
  Seq,
  SeqMany,
  Repeat,
  SepBy,
  Lazy,
  parse,
} from "./parser";
import { Token } from "./lexer";

const baseToken = {
  index: 0,
  outerIndex: 0,
  length: 0,
};

function kw(value: string): Token {
  return {
    type: "identifier",
    value,
    ...baseToken,
  };
}

function op(value: string): Token {
  return {
    type: "operator",
    value,
    ...baseToken,
  };
}

function val(value: unknown): Token {
  return {
    type: "value",
    value,
    ...baseToken,
  };
}

const optional = <T>(parser: Parser<T>, getDefault: () => T) =>
  new Alt([parser, new Zero(getDefault)]);

test("simple parsers", () => {
  expect(parse([], new Zero(() => 123))).toEqual(123);
  expect(parse([kw("foo")], new Literal("foo"))).toEqual("foo");
  expect(parse([kw("foo")], new TokType("identifier"))).toEqual("foo");
  expect(() => {
    parse([], new Literal("foo"));
  }).toThrow();
  expect(() => {
    parse([kw("foo"), kw("bar")], new Literal("foo"));
  }).toThrow();
  expect(() => {
    parse([kw("bar")], new Literal("foo"));
  }).toThrow();
  expect(() => {
    parse([val("foo")], new Literal("foo"));
  }).toThrow();
  expect(() => {
    parse([kw("foo")], new TokType("value"));
  }).toThrow();
});

test("seq", () => {
  expect(
    parse(
      [kw("foo"), kw("bar")],
      new Seq(() => true, new Literal("foo"), new Literal("bar"))
    )
  ).toEqual(true);
  expect(() => {
    parse(
      [kw("foo")],
      new Seq(() => true, new Literal("foo"), new Literal("bar"))
    );
  }).toThrow();
  expect(() => {
    parse(
      [kw("foo"), kw("foo")],
      new Seq(() => true, new Literal("foo"), new Literal("bar"))
    );
  }).toThrow();
  expect(() => {
    parse(
      [kw("bar"), kw("bar")],
      new Seq(() => true, new Literal("foo"), new Literal("bar"))
    );
  }).toThrow();
});

test("seqMany", () => {
  expect(
    parse(
      [kw("foo"), kw("bar")],
      new SeqMany((x, y) => y, [new Literal("foo"), new Literal("bar")])
    )
  ).toEqual("bar");
  expect(
    parse(
      [kw("foo"), kw("bar")],
      new SeqMany(() => true, [
        new Zero(() => null),
        new Literal("foo"),
        new Literal("bar"),
      ])
    )
  ).toEqual(true);
  expect(() => {
    parse(
      [kw("foo")],
      new SeqMany(() => true, [new Literal("foo"), new Literal("bar")])
    );
  }).toThrow();
  expect(() => {
    parse(
      [kw("foo"), kw("foo")],
      new SeqMany(() => true, [new Literal("foo"), new Literal("bar")])
    );
  }).toThrow();
  expect(() => {
    parse(
      [kw("bar"), kw("bar")],
      new SeqMany(() => true, [new Literal("foo"), new Literal("bar")])
    );
  }).toThrow();
});

test("alt", () => {
  const nulp = new Zero(() => null);

  expect(
    parse([kw("foo")], new Alt([new Literal("foo"), new Literal("bar")]))
  ).toEqual("foo");
  expect(
    parse([kw("bar")], new Alt([new Literal("foo"), new Literal("bar")]))
  ).toEqual("bar");
  expect(
    parse([val("bar")], new Alt([new Literal("foo"), new TokType("value")]))
  ).toEqual("bar");
  expect(
    parse([], new Alt([new Literal("foo"), new Lazy(() => nulp)]))
  ).toEqual(null);

  expect(() => {
    parse([], new Alt([new Literal("foo"), new Literal("bar")]));
  }).toThrow();
  expect(() => {
    parse([kw("baz")], new Alt([new Literal("foo"), new Literal("bar")]));
  }).toThrow();
  expect(() => {
    new Alt([nulp, nulp]);
  }).toThrow();
});

test("alt favors literal parser", () => {
  expect(
    parse(
      [kw("foo"), val("bar")],
      new Alt([
        new Seq(() => 1, new TokType("identifier"), new TokType("value")),
        new Seq(() => 2, new Literal("foo"), new TokType("value")),
      ])
    )
  ).toEqual(2);
  expect(
    parse(
      [kw("foo")],
      new Alt([
        new Seq(
          () => 1,
          optional(new TokType("value"), () => null),
          new TokType("identifier")
        ),
        new Seq(
          () => 2,
          optional(new TokType("value"), () => null),
          new Literal("foo")
        ),
      ])
    )
  ).toEqual(2);
});

test("alt goes in order when ambiguous", () => {
  expect(
    parse(
      [kw("foo"), kw("bar")],
      new Alt([
        new Seq(() => 1, new TokType("identifier"), new Literal("foo")),
        new Seq(() => 2, new TokType("identifier"), new Literal("bar")),
      ])
    )
  ).toEqual(2);
});

test("repeat", () => {
  expect(parse([val(1), val(2)], new Repeat(new TokType("value")))).toEqual([
    1,
    2,
  ]);
  expect(parse([], new Repeat(new TokType("value")))).toEqual([]);
  expect(() => {
    new Repeat(new Zero(() => null));
  }).toThrow();
});

test("sepBy", () => {
  expect(
    parse(
      [val(1), op(","), val(2)],
      new SepBy(new TokType("value"), new Literal(","))
    )
  ).toEqual([1, 2]);

  expect(
    parse(
      [val(1), op(","), val(2), op(",")],
      new SepBy(new TokType("value"), new Literal(","))
    )
  ).toEqual([1, 2]);

  expect(
    parse([val(1)], new SepBy(new TokType("value"), new Literal(",")))
  ).toEqual([1]);

  expect(() => {
    parse(
      [val(1), op(","), op(",")],
      new SepBy(new TokType("value"), new Literal(","))
    );
  }).toThrow();

  expect(() => {
    parse([], new SepBy(new TokType("value"), new Literal(",")));
  }).toThrow();

  expect(() => {
    parse(
      [val(1), op(","), val(2)],
      new SepBy(new Zero(() => null), new Literal(","))
    );
  }).toThrow();

  expect(() => {
    parse(
      [val(1), op(","), val(2)],
      new SepBy(new TokType("value"), new Zero(() => null))
    );
  }).toThrow();
});

test("lazy", () => {
  expect(parse([kw("foo")], new Lazy(() => new Literal("foo")))).toEqual("foo");
});
