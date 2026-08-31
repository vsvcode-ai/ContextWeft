export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly readStdin: (maximumBytes: number) => Promise<string>;
}

export const processIo: CliIo = {
  stdout(text) {
    process.stdout.write(`${text}\n`);
  },
  stderr(text) {
    process.stderr.write(`${text}\n`);
  },
  async readStdin(maximumBytes) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bytes += buffer.byteLength;
      if (bytes > maximumBytes) {
        throw new Error(`stdin exceeds the ${maximumBytes}-byte limit`);
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  },
};
