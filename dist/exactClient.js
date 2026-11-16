// Handmatig gecompileerd (CommonJS) uit src/exactClient.ts.
"use strict";
const { readTokens, writeTokens } = require("./tokenStore.js");
const { refreshTokens } = require("./exactAuth.js");

class ExactClient {
  constructor(config) {
    this.config = config;
    this.tokens = readTokens(config.tokenStorePath);
    /** Lopende refresh, zodat parallelle aanroepen er maar één starten. */
    this.refreshing = null;
  }

  persist() {
    if (this.tokens) writeTokens(this.config.tokenStorePath, this.tokens);
  }

  /**
   * Werkt de tokens in het geheugen van deze (mogelijk al langer draaiende)
   * instantie bij. Nodig na een nieuwe OAuth-login op een server die al
   * opgestart was: writeTokens() schrijft alleen naar schijf, dit zorgt dat
   * de actieve instantie ze ook meteen gebruikt zonder herstart.
   */
  setTokens(tokens) {
    this.tokens = tokens;
  }

  /**
   * Neemt tokens van schijf over als die nieuwer zijn dan die in het geheugen
   * (bv. na een login of een refresh door een andere procesinstantie).
   */
  syncFromDisk() {
    const disk = readTokens(this.config.tokenStorePath);
    if (disk && (!this.tokens || disk.expiresAt > this.tokens.expiresAt)) {
      this.tokens = { ...disk, division: disk.division ?? this.tokens?.division };
    }
  }

  /**
   * Ververst het access- en refresh-token nu meteen. Exact roteert het
   * refresh token bij elk gebruik (en het is 30 dagen geldig vanaf uitgifte),
   * dus regelmatig aanroepen houdt de login in leven. Parallelle aanroepen
   * delen één refresh, anders ongeldigt de eerste het token van de tweede.
   * Geeft het tijdstip (epoch ms) terug waarop het nieuwe access token verloopt.
   */
  refreshNow() {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async doRefresh() {
    this.syncFromDisk();
    if (!this.tokens) {
      throw new Error(
        "Nog niet ingelogd bij Exact Online. Open eerst /oauth/login op de server om in te loggen."
      );
    }

    let refreshed;
    try {
      refreshed = await refreshTokens(this.config, this.tokens.refreshToken);
    } catch (err) {
      // Een andere procesinstantie kan het token net geroteerd hebben:
      // probeer één keer opnieuw met wat inmiddels op schijf staat.
      const before = this.tokens.refreshToken;
      this.syncFromDisk();
      if (this.tokens.refreshToken === before) throw err;
      refreshed = await refreshTokens(this.config, this.tokens.refreshToken);
    }

    this.tokens = {
      ...this.tokens,
      accessToken: refreshed.access_token,
      // Exact Online roteert het refresh token bij elk gebruik — de oude
      // stopt met werken, dus we moeten de nieuwe meteen opslaan.
      refreshToken: refreshed.refresh_token,
      expiresAt: Date.now() + Number(refreshed.expires_in) * 1000,
    };
    this.persist();
    return this.tokens.expiresAt;
  }

  /** Ensures we have a valid (non-expired) access token, refreshing if needed. */
  async ensureAccessToken() {
    this.syncFromDisk();
    if (!this.tokens) {
      throw new Error(
        "Nog niet ingelogd bij Exact Online. Open eerst /oauth/login op de server om in te loggen."
      );
    }

    // Exact weigert een refresh zolang het access token nog geldig is
    // ("access_token not expired"), dus pas verversen als het echt verlopen is.
    if (Date.now() >= this.tokens.expiresAt) {
      await this.refreshNow();
    }

    return this.tokens.accessToken;
  }

  /**
   * Voor de keep-alive: ververst alleen als het access token verlopen is
   * (Exact staat eerder verversen niet toe). Is het token nog vers, dan is
   * ook het refresh token vers (ze worden samen uitgegeven), dus niets te doen.
   */
  async keepAlive() {
    this.syncFromDisk();
    if (!this.tokens) {
      throw new Error(
        "Nog niet ingelogd bij Exact Online. Open eerst /oauth/login op de server om in te loggen."
      );
    }
    if (Date.now() < this.tokens.expiresAt) {
      return { refreshed: false, expiresAt: this.tokens.expiresAt };
    }
    return { refreshed: true, expiresAt: await this.refreshNow() };
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

module.exports = { ExactClient };
