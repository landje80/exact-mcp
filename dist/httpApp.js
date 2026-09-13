// Handmatig gecompileerd uit src/httpApp.ts.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { ExactClient } from "./exactClient.js";
import { buildMcpServer } from "./mcpServer.js";
import { buildAuthorizationUrl, exchangeCodeForTokens } from "./exactAuth.js";
import { writeTokens } from "./tokenStore.js";

// --- TIJDELIJKE DIAGNOSE — mag later weer weg ---
// Schrijft (vóór loadConfig() kan crashen) een bestand met alleen booleans
// (nooit de echte geheime waarden) zodat we via Bestandsbeheer kunnen zien
// of Passenger de "Aangepaste omgevingsvariabelen" wel echt doorgeeft aan
// het proces.
try {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  fs.writeFileSync(
    path.join(__dirname, "..", "startup-debug.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        cwd: process.cwd(),
        hasClientId: Boolean(process.env.EXACT_CLIENT_ID),
        hasClientSecret: Boolean(process.env.EXACT_CLIENT_SECRET),
        redirectUri: process.env.EXACT_REDIRECT_URI || null,
        country: process.env.EXACT_COUNTRY || null,
        allowWrite: process.env.ALLOW_WRITE || null,
        hasMcpApiKey: Boolean(process.env.MCP_API_KEY),
        hasAdminSetupKey: Boolean(process.env.ADMIN_SETUP_KEY),
        port: process.env.PORT || null,
      },
      null,
      2
    )
  );
} catch {
  // Best effort — mag nooit de app zelf laten crashen.
}
// --- EINDE TIJDELIJKE DIAGNOSE ---

/**
 * HTTP-variant van de MCP server, bedoeld om 24/7 te draaien (bv. via Plesk
 * Node.js hosting) zodat cloud-clients zoals Microsoft Copilot Studio erbij
 * kunnen — die kunnen geen lokaal stdio-proces starten zoals Claude
 * Desktop/Code dat wel kan.
 *
 * Blootgestelde routes:
 *   GET  /oauth/login    - start de Exact Online login (beschermd met ADMIN_SETUP_KEY)
 *   GET  /oauth/callback - vangt de OAuth-callback van Exact op
 *   POST /mcp            - het eigenlijke MCP endpoint (beschermd met MCP_API_KEY)
 *   GET  /health         - simpele statuscheck, geen gevoelige info
 */

const config = loadConfig();
const client = new ExactClient(config);

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// OAuth setup routes — alleen bedoeld voor de beheerder, eenmalig (of na het
// verlopen van het refresh token na 30 dagen inactiviteit).
// ---------------------------------------------------------------------------

const pendingStates = new Set();

function requireSetupKey(req, res, next) {
  if (!config.adminSetupKey) {
    res.status(503).send("ADMIN_SETUP_KEY is niet ingesteld op de server — zet deze eerst in de environment variables.");
    return;
  }
  if (req.query.key !== config.adminSetupKey) {
    res.status(403).send("Ongeldige of ontbrekende setup key.");
    return;
  }
  next();
}

app.get("/oauth/login", requireSetupKey, (_req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.add(state);
  // States niet voor altijd laten opstapelen als een login nooit wordt afgemaakt.
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000).unref();
  res.redirect(buildAuthorizationUrl(config, state));
});

app.get("/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    res.status(400).send(`<h1>Inloggen mislukt</h1><p>Exact Online gaf een fout terug: ${String(error)}</p>`);
    return;
  }
  if (typeof state !== "string" || !pendingStates.has(state)) {
    res.status(400).send("<h1>Ongeldige of verlopen state</h1><p>Start de login opnieuw via /oauth/login.</p>");
    return;
  }
  pendingStates.delete(state);

  if (typeof code !== "string") {
    res.status(400).send("<h1>Geen code ontvangen</h1>");
    return;
  }

  try {
    const tokenResponse = await exchangeCodeForTokens(config, code);
    writeTokens(config.tokenStorePath, {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + Number(tokenResponse.expires_in) * 1000,
    });

    const division = await client.getDivision();
    res.send(
      `<h1>Gelukt!</h1><p>Ingelogd bij Exact Online. Huidige division: <b>${division}</b>.</p><p>Je kunt dit venster sluiten.</p>`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`<h1>Login mislukt</h1><pre>${message}</pre>`);
  }
});

// ---------------------------------------------------------------------------
// MCP endpoint — dit is wat Copilot Studio (of een andere remote MCP client)
// aanspreekt. Beschermd met een API key, want dit endpoint is publiek
// bereikbaar zodra het domein live staat.
// ---------------------------------------------------------------------------

function requireApiKey(req, res, next) {
  if (!config.mcpApiKey) {
    res.status(503).json({ error: "MCP_API_KEY is niet ingesteld op de server." });
    return;
  }

  const headerKey = req.header("x-api-key");
  const authHeader = req.header("authorization") || "";
  const bearerKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (headerKey !== config.mcpApiKey && bearerKey !== config.mcpApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.post("/mcp", requireApiKey, async (req, res) => {
  // Stateless: elke request krijgt een eigen server+transport-paar. Onze
  // tools zijn zelf stateless (ze proxy'en gewoon naar Exact Online), dus
  // sessies bijhouden tussen requests heeft hier geen toegevoegde waarde.
  try {
    const requestServer = buildMcpServer(config, client);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      transport.close();
      requestServer.close();
    });

    await requestServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Fout bij afhandelen MCP-request:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Interne serverfout" });
    }
  }
});

app.get("/mcp", requireApiKey, (_req, res) => {
  res.status(405).json({ error: "Method not allowed. Gebruik POST voor MCP-requests." });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: config.allowWrite ? "read-write" : "read-only", country: config.country });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(
    `Exact Online MCP HTTP server luistert op poort ${port} (${config.country}, ${config.allowWrite ? "lezen+schrijven" : "alleen-lezen"}).`
  );
});
