const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True only for a syntactically valid UUID.
 *
 * Deliberately strict about the shapes that cause broken URLs: the strings
 * "undefined" and "null" are what `${maybeUndefined}` produces in a template
 * literal, and they must never reach a route parameter.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
