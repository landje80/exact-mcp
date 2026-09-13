// Handmatig gecompileerd (CommonJS) uit src/tokenStore.ts.
"use strict";
const fs = require("node:fs");

function readTokens(tokenStorePath) {
  if (!fs.existsSync(tokenStorePath)) return undefined;
  try {
    const raw = fs.readFileSync(tokenStorePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeTokens(tokenStorePath, tokens) {
  fs.writeFileSync(tokenStorePath, JSON.stringify(tokens, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

module.exports = { readTokens, writeTokens };
