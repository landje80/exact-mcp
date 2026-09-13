import fs from "node:fs";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  /** Current division (administratienummer), cached after first lookup. */
  division?: string;
}

export function readTokens(tokenStorePath: string): StoredTokens | undefined {
  if (!fs.existsSync(tokenStorePath)) return undefined;
  try {
    const raw = fs.readFileSync(tokenStorePath, "utf-8");
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return undefined;
  }
}

export function writeTokens(tokenStorePath: string, tokens: StoredTokens): void {
  fs.writeFileSync(tokenStorePath, JSON.stringify(tokens, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}
