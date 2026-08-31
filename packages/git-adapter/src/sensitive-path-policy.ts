import type { SensitivePathPolicy } from "./ports.js";

const SENSITIVE_DIRECTORY_NAMES = new Set([
  ".aws",
  ".azure",
  ".gnupg",
  ".ssh",
  ".contextweft",
  "credentials",
  "secrets",
]);

const SENSITIVE_EXACT_NAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "credentials.json",
  "id_dsa",
  "id_ed25519",
  "id_rsa",
  "known_hosts",
  "netrc",
  "secrets.json",
]);

const SENSITIVE_SUFFIXES = [".key", ".kdbx", ".p12", ".pem", ".pfx"] as const;

/**
 * Conservative path-only secret policy.
 *
 * The Git adapter never reads file contents in phase 1. Filtering path names as
 * well prevents ContextPacks from revealing the presence or location of common
 * credentials. Callers can replace this policy at the adapter boundary.
 */
export class DefaultSensitivePathPolicy implements SensitivePathPolicy {
  public isSensitive(repositoryRelativePath: string): boolean {
    const normalized = repositoryRelativePath.replaceAll("\\", "/").toLowerCase();
    const segments = normalized.split("/").filter(Boolean);
    const basename = segments.at(-1) ?? "";

    if (segments.some((segment) => SENSITIVE_DIRECTORY_NAMES.has(segment))) {
      return true;
    }
    if (SENSITIVE_EXACT_NAMES.has(basename)) {
      return true;
    }
    if (basename.startsWith(".env.")) {
      return true;
    }
    return SENSITIVE_SUFFIXES.some((suffix) => basename.endsWith(suffix));
  }
}
