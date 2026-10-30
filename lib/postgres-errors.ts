export function hasPostgresErrorCode(error: unknown, code: string) {
  const visited = new Set<unknown>();
  let current = error;

  while (
    typeof current === "object" &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);

    if ("code" in current && current.code === code) {
      return true;
    }

    current = "cause" in current ? current.cause : undefined;
  }

  return false;
}
