// Handmatig gecompileerd uit src/tokenStore.ts.
import fs from "node:fs";

export function readTokens(tokenStorePath) {
  if (!fs.existsSync(tokenStorePath)) return undefined;
  try {
    const raw = fs.readFileSync(tokenStorePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeTokens(tokenStorePath, tokens) {
  fs.writeFileSync(tokenStorePath, JSON.stringify(tokens, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}
