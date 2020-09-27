import { grammar } from "../index.mjs";

const interval = (exclude) => (value, _, end) => ({
  value,
  interval: end - value,
  exclude,
});

function* doRange(
  { value: start, interval, exclude: excludeStart },
  _,
  { value: end, exclude: excludeEnd } = {}
) {
  if (interval === undefined) {
    interval = end > start ? 1 : -1;
  }
  const cmp =
    end === undefined
      ? () => true
      : interval > 0
      ? (x, y) => x < y
      : (x, y) => x > y;

  let value = start;
  if (excludeStart) {
    value += interval;
  }
  while (cmp(value, end)) {
    yield value;
    value += interval;
  }
  if (!excludeEnd && value === end) {
    yield value;
  }
}

export const range = grammar`
  OpenRange = Range ++ ","       : ${function* (ranges) {
    for (const r of ranges) {
      yield* r;
    }
  }}
            | Start "..."        : ${doRange}
            | Range

  Range = Start "..." End        : ${doRange}
        | value ++ ","

  Start = ExcludeValue "," value  : ${interval(true)}
        | value  "," value        : ${interval(false)}
        | value                   : ${(value) => ({ value, exclude: false })} 
  End   = ExcludeValue            : ${(value) => ({ value, exclude: true })}
        | value                   : ${(value) => ({ value, exclude: false })}

  ExcludeValue = #( value )
`;

export function test_basic_range(expect) {
  expect([...range`0 ... 10`]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
}

export function test_range_excluding_last_value(expect) {
  expect([...range`0 ... (10)`]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
}

export function test_range_interval(expect) {
  expect([...range`0, 2 ... (10)`]).toEqual([0, 2, 4, 6, 8]);
}

export function test_range_decreasing(expect) {
  expect([...range`10 ... 0`]).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
}
