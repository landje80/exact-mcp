# Exact Online MCP Server

Een MCP (Model Context Protocol) server die Claude laat koppelen met
[Exact Online](https://www.exactonline.nl) via de officiële REST API.

- OAuth2-login met automatische token-refresh (access tokens zijn 10 minuten
  geldig, refresh tokens roteren bij elk gebruik — dat wordt hier afgehandeld).
- Alleen-lezen of lezen+schrijven, instelbaar per gebruiker via `.env`.
- Curated tools voor veelgebruikte entiteiten (relaties, facturen, artikelen,
  grootboek) én een generieke `exact_get`/`exact_post`/`exact_put`/`exact_delete`
  tool voor alle overige endpoints.

## Vereisten

- Node.js 18 of hoger
- Een Exact Online account met voldoende rechten voor de acties die je wilt
  uitvoeren
- Een eigen App-registratie in het Exact App Center (zie hieronder)

## 1. App registreren bij Exact Online

Exact Online vereist dat elke applicatie die via de API verbindt eerst
geregistreerd wordt. Dit doe je zelf, met je eigen Exact-account:

1. Ga naar <https://apps.exactonline.com/nl/manage> (of het App Center van
   jouw regio) en log in met je Exact Online account.
2. Maak een nieuwe app aan, bijvoorbeeld genaamd "Claude MCP".
3. Vul bij **Redirect URI** exact in: `http://localhost:8934/callback`
   (of een andere poort, zolang die overeenkomt met `EXACT_REDIRECT_URI` in
   je `.env`).
4. Sla op en kopieer de **Client ID** en **Client Secret** die je krijgt.

> Exact Online kent geen granulaire OAuth-scopes bij registratie — de
> rechten van de ingelogde gebruiker in Exact bepalen wat de API-koppeling
> mag zien/doen. Log dus in met een Exact-gebruiker die de juiste rechten
> heeft voor wat je wilt bereiken.

## 2. Project installeren

```bash
cd exact-online-mcp
npm install
cp .env.example .env
```

Vul in `.env` in:

- `EXACT_CLIENT_ID` / `EXACT_CLIENT_SECRET` — uit stap 1
- `EXACT_REDIRECT_URI` — moet exact overeenkomen met wat je in het App
  Center hebt ingevuld
- `EXACT_COUNTRY` — regio van je Exact Online omgeving (`nl`, `be`, `de`,
  `fr`, `uk`, `es`, `us`)
- `ALLOW_WRITE` — `false` voor alleen-lezen (aanbevolen startpunt),
  `true` om ook aanmaak/wijzig/verwijder-tools te activeren

## 3. Inloggen (eenmalig, en opnieuw als het refresh token verloopt)

```bash
npm run login
```

Dit opent je browser voor de Exact Online inlogpagina, vangt de callback op
via een tijdelijke lokale server, en slaat de tokens op in `tokens.json`
(staat in `.gitignore` — commit dit bestand nooit, het geeft volledige
toegang tot je administratie).

Refresh tokens van Exact Online zijn maximaal 30 dagen geldig; als je langer
dan 30 dagen niet inlogt, moet je `npm run login` opnieuw draaien.

## 4. Bouwen en koppelen aan Claude

```bash
npm run build
```

### Claude Code

```bash
claude mcp add exact-online -- node "C:\Users\JohanLandnicecloud\projects\exact-online-mcp\dist\index.js"
```

### Claude Desktop

Voeg toe aan `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "exact-online": {
      "command": "node",
      "args": ["C:\\Users\\JohanLandnicecloud\\projects\\exact-online-mcp\\dist\\index.js"]
    }
  }
}
```

Herstart Claude Desktop / Claude Code na het toevoegen.

## Beschikbare tools

**Altijd beschikbaar (lezen):**

- `whoami` — huidige gebruiker + division
- `list_accounts`, `list_contacts`, `list_items`, `list_gl_accounts`,
  `list_sales_invoices`, `list_purchase_invoices`, `list_sales_orders`
  (elk met optionele `top` / `filter` / `select` / `orderby` parameters,
  conform OData)
- `exact_get` — generiek GET-request naar elk REST-endpoint

**Alleen als `ALLOW_WRITE=true`:**

- `exact_post`, `exact_put`, `exact_delete` — generieke schrijf-requests
- `create_sales_invoice`, `create_account`, `update_account`

De volledige lijst van beschikbare endpoints/entiteiten (voor gebruik met
`exact_get`/`exact_post`/etc.) staat in de
[Exact Online REST API reference](https://start.exactonline.nl/docs/HlpRestAPIResources.aspx).

## Beveiliging & rate limits

- `tokens.json` en `.env` bevatten gevoelige gegevens — nooit committen of
  delen.
- Schrijf-acties (facturen, relaties) zijn vaak lastig terug te draaien in
  een boekhouding — laat Claude bij twijfel eerst bevestigen wat er precies
  verstuurd gaat worden.
- Exact Online hanteert rate limits (per minuut en per dag, zichtbaar in de
  `X-RateLimit-*` response headers). Bij overschrijding geeft de API een
  4xx/5xx-fout terug die als tool-fout naar Claude wordt doorgegeven.

## Projectstructuur

```
src/
  config.ts       Leest .env en bepaalt land/regio, division, schrijfmodus
  exactAuth.ts    OAuth2 authorization-url + token exchange/refresh
  exactClient.ts  Authenticated API-client met automatische token-refresh
  tokenStore.ts   Lezen/schrijven van tokens.json
  mcpServer.ts    Alle tool-registraties (gedeeld tussen stdio en HTTP)
  login.ts        Eenmalige interactieve lokale login-flow (npm run login)
  index.ts        stdio-server — voor lokaal gebruik met Claude Code/Desktop
  httpApp.ts      HTTP-server — voor 24/7 hosting, bv. met Copilot Studio
app.js            Startbestand voor Plesk Node.js hosting (laadt dist/httpApp.js)
```

## Deployment op Plesk voor gebruik met Microsoft Copilot Studio

Copilot Studio draait in de cloud en kan geen lokaal proces starten zoals
Claude Code/Desktop dat doen — het moet een **altijd bereikbare HTTPS-URL**
aanspreken. Copilot Studio ondersteunt daarvoor alleen de "Streamable HTTP"
MCP-transport (sinds augustus 2025 geen SSE meer), en als eenvoudigste
authenticatie een **API key in een header**. Dat is precies wat `httpApp.ts`
implementeert.

### 1. Exact Online app bijwerken

Zet in het App Center de **Redirect URI** van je app op je publieke domein,
bijvoorbeeld:

```
https://mcp.juvion.nl/oauth/callback
```

### 2. Bestanden uploaden naar Plesk

Upload de hele projectmap (m.u.v. `node_modules/`) naar de applicatie-hoofdmap
die je bij "Node.js" hebt ingesteld (bv. `/mcp.juvion.nl`) — via Git, FTP, of
Plesk's "Bestandsbeheer".

### 3. Environment variables instellen in Plesk

Vul in het Node.js-paneel van je domein (bij "Aangepaste omgevingsvariabelen")
in:

| Variabele | Waarde |
|---|---|
| `EXACT_CLIENT_ID` | uit het App Center |
| `EXACT_CLIENT_SECRET` | uit het App Center |
| `EXACT_REDIRECT_URI` | `https://mcp.juvion.nl/oauth/callback` |
| `EXACT_COUNTRY` | `nl` (of jouw regio) |
| `ALLOW_WRITE` | `false` om te beginnen — pas later aanzetten indien nodig |
| `MCP_API_KEY` | een lang willekeurig geheim (bv. `openssl rand -hex 32`) |
| `ADMIN_SETUP_KEY` | nog een lang willekeurig geheim, apart van `MCP_API_KEY` |

### 4. Installeren

Gebruik in Plesk het tabblad **"Node.js-opdrachten uitvoeren"** (typ alleen wat
ná `npm` komt, het paneel prefixt dat zelf) om te draaien:

```
install
```

> **Let op — over de `dist/`-map:** deze projectmap bevat al een kant-en-klare
> `dist/` map met gecompileerde JavaScript-bestanden; je hoeft dus **niet**
> `npm run build` te draaien. Op sommige Plesk-installaties gebruikt de
> "Node.js-opdrachten uitvoeren"-console namelijk een verouderde,
> systeem-brede Node.js-versie in plaats van de versie die je voor dit domein
> hebt ingesteld, waardoor `tsc` crasht met een `SyntaxError`. De app zelf
> (via Passenger) draait wél gewoon op de Node.js-versie die je bij dit domein
> hebt geselecteerd, dus de meegeleverde `dist/`-bestanden werken prima. Pas
> je later de broncode in `src/` aan, dan moet je de bijbehorende
> `dist/*.js`-bestanden ook met de hand (of via `tsc` op een machine waar dat
> wél werkt) bijwerken.

Klik na `npm install` op **"App opnieuw opstarten"**.

### 5. Inloggen bij Exact Online

Open in je browser (met je eigen `ADMIN_SETUP_KEY`):

```
https://mcp.juvion.nl/oauth/login?key=<jouw-ADMIN_SETUP_KEY>
```

Log in bij Exact Online; je wordt teruggestuurd naar `/oauth/callback` dat de
tokens opslaat op de server. Dit moet je opnieuw doen als het refresh token
verloopt (na 30 dagen zonder gebruik).

### 6. MCP server toevoegen in Copilot Studio

1. Ga naar je agent → **Tools** → **Add a tool** → **New tool** → **Model
   Context Protocol**.
2. **Server URL:** `https://mcp.juvion.nl/mcp`
3. **Authentication type:** **API key**
4. **Type:** **Header**, **naam:** `X-API-Key`, **waarde:** jouw `MCP_API_KEY`
5. Sla op en voeg de tool toe aan je agent.

Test daarna in de agent bijvoorbeeld: "Wat is de huidige Exact Online
gebruiker?" (roept de `whoami` tool aan).

### Verschil met de lokale (stdio) variant

De lokale `npm run login` / `npm start` blijven werken voor gebruik met
Claude Code/Desktop op je eigen machine — dat gebruikt een aparte, lokale
`EXACT_REDIRECT_URI` (`http://localhost:8934/...`). Zodra je de redirect URI
in het App Center wijzigt naar het publieke domein (stap 1 hierboven), werkt
de lokale login-flow niet meer met diezelfde app-registratie — voor gebruik
op beide plekken tegelijk heb je twee losse Exact-app-registraties nodig
(elk met hun eigen Client ID/Secret en `tokens.json`).
