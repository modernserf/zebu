import { grammar } from "../index.mjs";
// borrowed from @modernserf/data-expressions, to be ported

const dx = grammar`
  Main      = AltExpr               : ${decoratePattern}

  Pair      = Key "?"? ":" AltExpr  : ${(key, isOptional, _, expr) => ({
    key,
    isOptional,
    expr,
  })}
  AltExpr   = PathExpr ++ "|"       : ${(expr) => alt(expr)}
  PathExpr  = Expr ++ line?         : ${(exprs) => seq(exprs)}
  Expr      = "." Key "?"?          : ${(_, k, isOptional) =>
    key(k, isOptional)}
            | value                 : ${(pattern) => pattern}
            | "_"                   : ${() => any}
            | "*"                   : ${() => spread}

  Key       = identifier | value
`;

function* any(focus) {
  yield { match: focus, replace: (value) => value };
}

const key = (key, optional = false) =>
  function* (focus) {
    if (hasKey(focus, key) || optional) {
      yield {
        match: focus[key],
        replace: (value) => replaceIn(focus, key, value),
      };
    }
  };
function hasKey(focus, key) {
  if (!focus || typeof focus !== "object") {
    return false;
  }
  return key in focus;
}
function replaceIn(focus, key, value) {
  if (Array.isArray(focus)) {
    const copy = [...focus];
    copy[key] = value;
    return copy;
  } else {
    return { ...focus, [key]: value };
  }
}

function* spread(focus) {
  for (const [k, value] of Object.entries(focus)) {
    yield* key(k)(value);
  }
}

const alt = (patterns) =>
  function* (focus) {
    for (const pattern of patterns) {
      yield* pattern(focus);
    }
  };

const _seq = (x, y) =>
  function* (focus) {
    for (const outer of x(focus)) {
      for (const inner of y(outer.match)) {
        yield {
          match: inner.match,
          replace: (value) => outer.replace(inner.replace(value)),
        };
      }
    }
  };
const seq = (xs) => xs.reduce(_seq, any);

function matchAll(pattern, focus) {
  const gen = pattern(focus);
  const { value, done } = gen.next();
  const matched = !done;
  const firstMatch = matched ? value.match : undefined;
  return {
    matched,
    result: firstMatch,
    *[Symbol.iterator]() {
      if (!matched) {
        return;
      }
      yield firstMatch;
      for (const { match } of gen) {
        yield match;
      }
    },
  };
}

function decoratePattern(pattern) {
  pattern.test = (focus) => matchAll(pattern, focus).matched;
  pattern.match = (focus) => matchAll(pattern, focus).result;
  pattern.matchAll = (focus) => matchAll(pattern, focus);
  pattern.replace = (focus, value) => {
    for (const { replace } of pattern(focus)) {
      return replace(value);
    }
    return focus;
  };
  return pattern;
}

export function test_key_path(expect) {
  expect(dx`.foo.bar`.test({ foo: { bar: 3 } })).toEqual(true);
  expect(dx`.foo.bar`.match({ foo: { bar: 3 } })).toEqual(3);
  expect(dx`.foo.bar`.replace({ foo: { bar: 3 } }, 5)).toEqual({
    foo: { bar: 5 },
  });
}
