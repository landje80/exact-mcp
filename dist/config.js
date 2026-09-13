// Handmatig gecompileerd uit src/config.ts (geen tsc nodig op de server —
// zie het "Waarom staat er een dist/ map" stuk in de README).
import "dotenv/config";
import path from "node:path";

const COUNTRY_HOSTS = {
  nl: "https://start.exactonline.nl",
  be: "https://start.exactonline.be",
  de: "https://start.exactonline.de",
  fr: "https://start.exactonline.fr",
  uk: "https://start.exactonline.co.uk",
  es: "https://start.exactonline.es",
  us: "https://start.exactonline.com",
};

function required(name, value) {
  if (!value) {
    throw new Error(
      `Ontbrekende environment variable: ${name}. Kopieer .env.example naar .env en vul in.`
    );
  }
  return value;
}

export function loadConfig() {
  const country = (process.env.EXACT_COUNTRY || "nl").toLowerCase();
  const baseUrl = COUNTRY_HOSTS[country];
  if (!baseUrl) {
    throw new Error(
      `Onbekende EXACT_COUNTRY "${country}". Ondersteund: ${Object.keys(COUNTRY_HOSTS).join(", ")}`
    );
  }

  return {
    clientId: required("EXACT_CLIENT_ID", process.env.EXACT_CLIENT_ID),
    clientSecret: required("EXACT_CLIENT_SECRET", process.env.EXACT_CLIENT_SECRET),
    redirectUri: process.env.EXACT_REDIRECT_URI || "http://localhost:8934/callback",
    country,
    baseUrl,
    division: process.env.EXACT_DIVISION || undefined,
    allowWrite: (process.env.ALLOW_WRITE || "false").toLowerCase() === "true",
    tokenStorePath: path.resolve(process.env.TOKEN_STORE_PATH || "./tokens.json"),
    mcpApiKey: process.env.MCP_API_KEY || undefined,
    adminSetupKey: process.env.ADMIN_SETUP_KEY || undefined,
  };
}
