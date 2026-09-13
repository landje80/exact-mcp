// Handmatig gecompileerd (CommonJS) uit src/mcpServer.ts.
"use strict";
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");

function toResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function toErrorResult(err) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

/** Shared query parameters supported by (almost) every Exact Online list endpoint. */
const listQuerySchema = {
  top: z.number().int().positive().max(1000).optional().describe("Max aantal resultaten (OData $top)."),
  filter: z.string().optional().describe("OData $filter expressie, bv. \"Status eq 20\"."),
  select: z.string().optional().describe("Komma-gescheiden veldnamen (OData $select), bv. \"ID,Name\"."),
  orderby: z.string().optional().describe("OData $orderby, bv. \"Created desc\"."),
};

function buildListQuery(args) {
  return {
    $top: args.top,
    $filter: args.filter,
    $select: args.select,
    $orderby: args.orderby,
  };
}

/**
 * Bouwt een compleet geconfigureerde McpServer met alle Exact Online tools.
 * Wordt zowel door de lokale stdio-server (index.js) als de HTTP-server
 * (httpApp.js, voor Copilot Studio) gebruikt — één plek voor alle tools.
 */
function buildMcpServer(config, client) {
  const server = new McpServer({
    name: "exact-online-mcp",
    version: "0.1.0",
  });

  // ---------------------------------------------------------------------
  // Generieke tools (altijd beschikbaar voor lezen, escape hatch voor
  // endpoints die geen curated tool hebben — zie
  // https://start.exactonline.nl/docs/HlpRestAPIResources.aspx)
  // ---------------------------------------------------------------------

  server.tool(
    "exact_get",
    "Doet een GET-request naar een willekeurig Exact Online REST API endpoint (relatief pad, bv. 'crm/Accounts' of 'salesinvoice/SalesInvoices'). Gebruik dit voor entiteiten waar geen specifieke tool voor bestaat.",
    {
      resourcePath: z.string().describe("Relatief pad na /api/v1/{division}/, bv. 'crm/Accounts'."),
      query: z
        .record(z.string())
        .optional()
        .describe("OData query parameters als object, bv. {\"$top\": \"10\", \"$filter\": \"Status eq 20\"}."),
    },
    async ({ resourcePath, query }) => {
      try {
        const data = await client.request("GET", resourcePath, { query });
        return toResult(data);
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  if (config.allowWrite) {
    const writeTool = (method, name, description) => {
      server.tool(
        name,
        description,
        {
          resourcePath: z.string().describe("Relatief pad na /api/v1/{division}/, bv. \"crm/Accounts\" of \"crm/Accounts(guid'...')\"."),
          body: z.record(z.any()).optional().describe("JSON body om te versturen."),
        },
        async ({ resourcePath, body }) => {
          try {
            const data = await client.request(method, resourcePath, { body });
            return toResult(data ?? { success: true });
          } catch (err) {
            return toErrorResult(err);
          }
        }
      );
    };

    writeTool("POST", "exact_post", "Doet een POST-request naar Exact Online (aanmaken van een entiteit). Alleen beschikbaar omdat ALLOW_WRITE=true is ingesteld.");
    writeTool("PUT", "exact_put", "Doet een PUT-request naar Exact Online (wijzigen van een entiteit). Alleen beschikbaar omdat ALLOW_WRITE=true is ingesteld.");

    server.tool(
      "exact_delete",
      "Doet een DELETE-request naar Exact Online (verwijderen van een entiteit). Onomkeerbaar — vraag altijd bevestiging voordat je dit aanroept. Alleen beschikbaar omdat ALLOW_WRITE=true is ingesteld.",
      {
        resourcePath: z.string().describe("Relatief pad naar de te verwijderen entiteit, bv. \"crm/Accounts(guid'...')\"."),
      },
      async ({ resourcePath }) => {
        try {
          const data = await client.request("DELETE", resourcePath);
          return toResult(data ?? { success: true });
        } catch (err) {
          return toErrorResult(err);
        }
      }
    );
  }

  // ---------------------------------------------------------------------
  // Curated leestools voor veelgebruikte entiteiten
  // ---------------------------------------------------------------------

  function registerListTool(name, resourcePath, description) {
    server.tool(name, description, listQuerySchema, async (args) => {
      try {
        const data = await client.request("GET", resourcePath, { query: buildListQuery(args) });
        return toResult(data);
      } catch (err) {
        return toErrorResult(err);
      }
    });
  }

  registerListTool("list_accounts", "crm/Accounts", "Haalt relaties/klanten op (crm/Accounts).");
  registerListTool("list_contacts", "crm/Contacts", "Haalt contactpersonen op (crm/Contacts).");
  registerListTool("list_items", "logistics/Items", "Haalt artikelen op (logistics/Items).");
  registerListTool("list_gl_accounts", "financial/GLAccounts", "Haalt grootboekrekeningen op (financial/GLAccounts).");
  registerListTool("list_sales_invoices", "salesinvoice/SalesInvoices", "Haalt verkoopfacturen op (salesinvoice/SalesInvoices).");
  registerListTool("list_purchase_invoices", "purchase/PurchaseInvoices", "Haalt inkoopfacturen op (purchase/PurchaseInvoices).");
  registerListTool("list_sales_orders", "salesorder/SalesOrders", "Haalt verkooporders op (salesorder/SalesOrders).");

  server.tool(
    "whoami",
    "Geeft basisinformatie over de ingelogde Exact Online gebruiker en de huidige division/administratie.",
    {},
    async () => {
      try {
        const me = await client.request("GET", "current/Me", {
          query: { $select: "UserID,UserName,FullName,Email,CurrentDivision" },
          skipDivision: true,
        });
        return toResult(me);
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  if (config.allowWrite) {
    server.tool(
      "create_sales_invoice",
      "Maakt een nieuwe verkoopfactuur aan (POST salesinvoice/SalesInvoices). Onomkeerbaar zodra geboekt — controleer de gegevens goed.",
      {
        body: z.record(z.any()).describe("Factuurgegevens conform het Exact Online SalesInvoice schema, bv. { InvoiceTo: '<guid>', SalesInvoiceLines: [...] }."),
      },
      async ({ body }) => {
        try {
          const data = await client.request("POST", "salesinvoice/SalesInvoices", { body });
          return toResult(data);
        } catch (err) {
          return toErrorResult(err);
        }
      }
    );

    server.tool(
      "create_account",
      "Maakt een nieuwe relatie/klant aan (POST crm/Accounts).",
      {
        body: z.record(z.any()).describe("Relatiegegevens, bv. { Name: 'Acme BV', Email: 'info@acme.nl' }."),
      },
      async ({ body }) => {
        try {
          const data = await client.request("POST", "crm/Accounts", { body });
          return toResult(data);
        } catch (err) {
          return toErrorResult(err);
        }
      }
    );

    server.tool(
      "update_account",
      "Wijzigt een bestaande relatie/klant (PUT crm/Accounts(guid'...')).",
      {
        id: z.string().describe("GUID van de relatie (zonder guid'' wrapper)."),
        body: z.record(z.any()).describe("Velden die gewijzigd moeten worden."),
      },
      async ({ id, body }) => {
        try {
          const data = await client.request("PUT", `crm/Accounts(guid'${id}')`, { body });
          return toResult(data ?? { success: true });
        } catch (err) {
          return toErrorResult(err);
        }
      }
    );
  }

  return server;
}

module.exports = { buildMcpServer };
