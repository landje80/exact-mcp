// Handmatig gecompileerd uit src/exactClient.ts.
import { readTokens, writeTokens } from "./tokenStore.js";
import { refreshTokens } from "./exactAuth.js";

export class ExactClient {
  constructor(config) {
    this.config = config;
    this.tokens = readTokens(config.tokenStorePath);
  }

  persist() {
    if (this.tokens) writeTokens(this.config.tokenStorePath, this.tokens);
  }

  /** Ensures we have a valid (non-expired) access token, refreshing if needed. */
  async ensureAccessToken() {
    if (!this.tokens) {
      throw new Error(
        "Nog niet ingelogd bij Exact Online. Draai eerst `npm run login` om in te loggen."
      );
    }

    const willExpireSoon = Date.now() > this.tokens.expiresAt - 60_000;
    if (willExpireSoon) {
      const refreshed = await refreshTokens(this.config, this.tokens.refreshToken);
      this.tokens = {
        ...this.tokens,
        accessToken: refreshed.access_token,
        // Exact Online rotates the refresh token on every use — de oude
        // stopt met werken, dus we moeten de nieuwe meteen opslaan.
        refreshToken: refreshed.refresh_token,
        expiresAt: Date.now() + Number(refreshed.expires_in) * 1000,
      };
      this.persist();
    }

    return this.tokens.accessToken;
  }

  /** Resolves the division (administratienummer) to use for API calls. */
  async getDivision() {
    if (this.config.division) return this.config.division;
    if (this.tokens?.division) return this.tokens.division;

    const me = await this.request("GET", "current/Me", {
      query: { $select: "CurrentDivision" },
      skipDivision: true,
    });
    const division = String(me.d.results[0]?.CurrentDivision ?? "");
    if (!division) {
      throw new Error("Kon de huidige division niet ophalen van Exact Online.");
    }
    if (this.tokens) {
      this.tokens.division = division;
      this.persist();
    }
    return division;
  }

  /**
   * Generic authenticated request against the Exact Online REST API.
   * `resourcePath` is relative, e.g. "crm/Accounts" of "salesinvoice/SalesInvoices".
   */
  async request(method, resourcePath, opts = {}) {
    const accessToken = await this.ensureAccessToken();

    const divisionSegment = opts.skipDivision ? "" : `/${await this.getDivision()}`;
    const base = `${this.config.baseUrl}/api/v1${divisionSegment}`;

    const url = new URL(`${base}/${resourcePath.replace(/^\/+/, "")}`);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Exact Online API-fout ${method} ${resourcePath} (${res.status}): ${text.slice(0, 2000)}`
      );
    }
    if (!text) return undefined;
    return JSON.parse(text);
  }
}
