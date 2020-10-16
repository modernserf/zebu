// istanbul ignore next
export function assertUnreachable(value: never): never {
  throw new Error(`shouldnt have gotten ${value}`);
}

export function partition<T>(
  iter: Iterable<T>,
  fn: (x: T) => boolean
): [T[], T[]] {
  const trues: T[] = [];
  const falses: T[] = [];

  for (const value of iter) {
    if (fn(value)) {
      trues.push(value);
    } else {
      falses.push(value);
    }
  }

  return [trues, falses];
}
