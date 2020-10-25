// istanbul ignore next
export function assertUnreachable(value: never): never {
  console.error("shouldnt have gotten (", value, ")");
  throw new Error(`unreachable`);
}

export function partition<T>(xs: T[], fn: (x: T) => boolean): [T[], T[]] {
  const trues: T[] = [];
  const falses: T[] = [];
  for (const x of xs) {
    if (fn(x)) {
      trues.push(x);
    } else {
      falses.push(x);
    }
  }
  return [trues, falses];
}
