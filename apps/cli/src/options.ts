import { CliUsageError } from "./errors.js";

export interface OptionDefinition {
  readonly type: "string" | "boolean";
}

export type ParsedOptions = ReadonlyMap<string, string | true>;

/** Minimal strict GNU-style long-option parser used to keep the CLI dependency-light. */
export function parseOptions(
  args: readonly string[],
  definitions: Readonly<Record<string, OptionDefinition>>,
): ParsedOptions {
  const values = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    /* v8 ignore next -- loop bounds guarantee an indexed token exists. */
    if (token === undefined) {
      throw new CliUsageError("Unexpected positional argument: ");
    }
    if (!token.startsWith("--") || token === "--") {
      throw new CliUsageError(`Unexpected positional argument: ${token}`);
    }
    const equalsIndex = token.indexOf("=");
    const name = token.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
    const definition = definitions[name];
    if (definition === undefined) {
      throw new CliUsageError(`Unknown option: --${name}`);
    }
    if (values.has(name)) {
      throw new CliUsageError(`Option may only be provided once: --${name}`);
    }
    if (definition.type === "boolean") {
      if (equalsIndex !== -1) {
        throw new CliUsageError(`Boolean option does not accept a value: --${name}`);
      }
      values.set(name, true);
      continue;
    }

    const inlineValue = equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);
    const nextValue = equalsIndex === -1 ? args[index + 1] : inlineValue;
    if (nextValue === undefined || nextValue.startsWith("--")) {
      throw new CliUsageError(`Option requires a value: --${name}`);
    }
    values.set(name, nextValue);
    if (equalsIndex === -1) {
      index += 1;
    }
  }
  return values;
}

export function stringOption(options: ParsedOptions, name: string): string | undefined {
  const value = options.get(name);
  return typeof value === "string" ? value : undefined;
}

export function requiredStringOption(options: ParsedOptions, name: string): string {
  const value = stringOption(options, name);
  if (value === undefined || value.trim().length === 0) {
    throw new CliUsageError(`Missing required option: --${name}`);
  }
  return value;
}

export function booleanOption(options: ParsedOptions, name: string): boolean {
  return options.get(name) === true;
}

export function integerOption(
  options: ParsedOptions,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = stringOption(options, name);
  if (raw === undefined) {
    return fallback;
  }
  if (!/^-?\d+$/u.test(raw)) {
    throw new CliUsageError(`Option --${name} must be an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new CliUsageError(`Option --${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

export function numberOption(
  options: ParsedOptions,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = stringOption(options, name);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new CliUsageError(`Option --${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}
