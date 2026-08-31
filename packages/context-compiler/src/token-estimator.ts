import type { TokenEstimator } from "./ports.js";

/**
 * Offline token estimator tuned conservatively for mixed source code and CJK.
 *
 * Exact tokenization is model-specific, so ContextWeft exposes this as a port.
 * The default deliberately overestimates CJK and symbol-heavy text to avoid
 * exceeding an agent's context limit when no model tokenizer is installed.
 */
export class HeuristicTokenEstimator implements TokenEstimator {
  public estimate(text: string): number {
    let asciiUnits = 0;
    let wideUnits = 0;
    for (const character of text) {
      if (character.codePointAt(0) !== undefined && (character.codePointAt(0) as number) <= 0x7f) {
        asciiUnits += 1;
      } else {
        wideUnits += 1;
      }
    }
    return Math.max(1, Math.ceil(asciiUnits / 4) + wideUnits);
  }

  public truncate(text: string, maximumTokens: number): string {
    if (maximumTokens < 1) {
      return "";
    }
    if (this.estimate(text) <= maximumTokens) {
      return text;
    }

    const characters = [...text];
    let low = 0;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = `${characters.slice(0, middle).join("")}…`;
      if (this.estimate(candidate) <= maximumTokens) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return `${characters.slice(0, low).join("")}…`;
  }
}
