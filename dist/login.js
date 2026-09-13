// Handmatig gecompileerd (CommonJS) uit src/login.ts.
// Lokale, eenmalige interactieve OAuth-login (npm run login) voor gebruik
// met de stdio-variant op je eigen machine. Niet gebruikt door de
// Plesk/Copilot Studio-deployment (die logt in via /oauth/login op de
// draaiende server zelf, zie dist/httpApp.js).
"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const { loadConfig } = require("./config.js");
const { buildAuthorizationUrl, exchangeCodeForTokens } = require("./exactAuth.js");
const { writeTokens } = require("./tokenStore.js");
const { ExactClient } = require("./exactClient.js");

async function main() {
  const config = loadConfig();
  const redirect = new URL(config.redirectUri);
  const port = Number(redirect.port || 80);
  const state = crypto.randomBytes(16).toString("hex");

  console.log("Exact Online login");
  console.log("===================");
  console.log(`Land/regio: ${config.country}  (${config.baseUrl})`);
  console.log(`Redirect URI: ${config.redirectUri}`);
  console.log();

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", config.redirectUri);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }

      const returnedState = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");
      const authCode = url.searchParams.get("code");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (errorParam) {
        res.end(`<h1>Inloggen mislukt</h1><p>${errorParam}</p>`);
        server.close();
        reject(new Error(`Exact Online gaf een fout terug: ${errorParam}`));
        return;
      }
      if (returnedState !== state) {
        res.end("<h1>Ongeldige state</h1><p>Sluit dit venster en probeer opnieuw.</p>");
        server.close();
        reject(new Error("State mismatch tijdens OAuth-callback (mogelijk CSRF)."));
        return;
      }
      if (!authCode) {
        res.end("<h1>Geen code ontvangen</h1>");
        server.close();
        reject(new Error("Geen authorization code ontvangen van Exact Online."));
        return;
      }

      res.end(
        "<h1>Gelukt!</h1><p>Je bent ingelogd bij Exact Online. Je kunt dit venster sluiten en teruggaan naar de terminal.</p>"
      );
      server.close();
      resolve(authCode);
    });

    server.listen(port, () => {
      const authUrl = buildAuthorizationUrl(config, state);
      console.log("Open deze URL in je browser om in te loggen (of hij opent vanzelf):");
      console.log(authUrl);
      console.log();
      // "open" is een ESM-only package; vanuit CommonJS gebruiken we een
      // dynamische import() om het toch te kunnen laden.
      import("open")
        .then(({ default: open }) => open(authUrl))
        .catch(() => {
          // Browser kon niet automatisch geopend worden — de link hierboven werkt ook.
        });
    });

    server.on("error", reject);
  });

  console.log("Code ontvangen, tokens ophalen...");
  const tokenResponse = await exchangeCodeForTokens(config, code);

  writeTokens(config.tokenStorePath, {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + Number(tokenResponse.expires_in) * 1000,
  });

  console.log("Tokens opgeslagen in", config.tokenStorePath);
  console.log("Division ophalen...");

  const client = new ExactClient(config);
  const division = await client.getDivision();
  console.log(`Ingelogd. Huidige division: ${division}`);
  console.log();
  console.log("Klaar! Je kunt nu de MCP server starten (npm start),");
  console.log("of hem koppelen aan Claude Code / Claude Desktop.");
}

main().catch((err) => {
  console.error("Login mislukt:", err.message ?? err);
  process.exit(1);
});
