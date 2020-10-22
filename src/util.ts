// istanbul ignore next
export function assertUnreachable(value: never): never {
  console.error("shouldnt have gotten (", value, ")");
  throw new Error(`unreachable`);
}
