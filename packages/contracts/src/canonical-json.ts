/**
 * Serializes JSON-compatible data with recursively sorted object keys.
 *
 * ContextWeft uses this representation for fingerprints and Golden Fixtures.
 * It deliberately rejects unsupported values instead of silently coercing them,
 * because a fingerprint that changes between runtimes would break freshness and
 * idempotency guarantees.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot encode non-finite numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry !== undefined) {
        result[key] = normalize(entry);
      }
    }
    return result;
  }

  throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
}
