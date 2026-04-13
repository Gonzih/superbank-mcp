#!/usr/bin/env node
"use strict";

// src/index.ts
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_zod = require("zod");
var API_KEY = process.env.SUPERBANK_API_KEY;
if (!API_KEY) {
  process.stderr.write("SUPERBANK_API_KEY env var is required\n");
  process.exit(1);
}
var ENV = process.env.SUPERBANK_ENV ?? "sandbox";
var BASE_URL = ENV === "production" ? "https://api.superbank.co" : "https://api-sandbox.superbank.co";
async function sbFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "X-Api-Key": API_KEY,
    "Content-Type": "application/json"
  };
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(
      `Superbank API error ${res.status}: ${typeof body === "object" ? JSON.stringify(body) : body}`
    );
  }
  return body;
}
function jsonText(data) {
  return JSON.stringify(data, null, 2);
}
var AddressSchema = import_zod.z.object({
  country_code: import_zod.z.string().describe("ISO 3166-1 alpha-2 country code, e.g. US"),
  street_line1: import_zod.z.string(),
  street_line2: import_zod.z.string().optional(),
  city: import_zod.z.string(),
  state_region_or_province: import_zod.z.string().optional(),
  postal_code: import_zod.z.string().optional()
});
var BeneficiarySchema = import_zod.z.object({
  type: import_zod.z.enum(["INDIVIDUAL", "BUSINESS"]).describe("Beneficiary type"),
  first_name: import_zod.z.string().optional().describe("Required for INDIVIDUAL"),
  last_name: import_zod.z.string().optional().describe("Required for INDIVIDUAL"),
  business_name: import_zod.z.string().optional().describe("Required for BUSINESS"),
  email: import_zod.z.string().optional(),
  address: AddressSchema.optional()
});
var DestinationSchema = import_zod.z.object({
  is_third_party: import_zod.z.boolean().describe("Whether destination is a third party"),
  rail: import_zod.z.string().describe(
    "Payment rail: SOLANA, ETHEREUM, TRON, ACH, RTP, WIRE, SEPA, SPEI, NIBSS, etc."
  ),
  currency: import_zod.z.string().describe("Currency code, e.g. USDC, USDT, USD, EUR"),
  wallet_address: import_zod.z.string().optional().describe("Crypto wallet address (for crypto rails)"),
  bank_name: import_zod.z.string().optional().describe("Bank name (for bank rails)"),
  account_number: import_zod.z.string().optional().describe("Bank account number (ACH/WIRE/NIBSS)"),
  routing_number: import_zod.z.string().optional().describe("ABA routing number (ACH/WIRE)"),
  iban: import_zod.z.string().optional().describe("IBAN (SEPA)"),
  bic: import_zod.z.string().optional().describe("BIC/SWIFT code (SEPA)"),
  clabe: import_zod.z.string().optional().describe("CLABE (SPEI/Mexico)"),
  bank_code: import_zod.z.string().optional().describe("Bank code (NIBSS/Nigeria)"),
  beneficiary: BeneficiarySchema.optional()
});
var server = new import_mcp.McpServer({
  name: "superbank",
  version: "1.0.0"
});
server.registerTool(
  "create_settlement_request",
  {
    description: "Create a new Superbank settlement request (fiat\u2192stablecoin, stablecoin\u2192fiat, fiat\u2192fiat, stablecoin\u2192stablecoin). Returns payment instructions including wallet address or bank details.",
    inputSchema: {
      type: import_zod.z.enum([
        "FIAT_TO_STABLECOIN",
        "STABLECOIN_TO_FIAT",
        "STABLECOIN_TO_STABLECOIN",
        "FIAT_TO_FIAT"
      ]).describe("Settlement transaction direction"),
      payment_reason: import_zod.z.string().describe(
        "Payment classification, e.g. REMITTANCES, EMPLOYEE_SALARIES_OR_WAGES, INVESTMENTS, TRADE_FINANCE, etc."
      ),
      amount: import_zod.z.number().min(0.01).describe("Settlement amount (minimum 0.01)"),
      destination: DestinationSchema,
      source: import_zod.z.object({
        currency: import_zod.z.string().optional(),
        rail: import_zod.z.string().optional(),
        wallet_address: import_zod.z.string().optional()
      }).optional().describe("Optional source details for conversions")
    }
  },
  async (args) => {
    const body = await sbFetch("/v0/settlement-requests", {
      method: "POST",
      body: JSON.stringify(args)
    });
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "list_settlement_requests",
  {
    description: "List all settlement requests. Returns ID, type, status, amount, and created_at for each.",
    inputSchema: {
      limit: import_zod.z.number().int().min(1).max(100).optional().describe("Max results to return (default 20)"),
      offset: import_zod.z.number().int().min(0).optional().describe("Pagination offset (default 0)")
    }
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.limit !== void 0) params.set("limit", String(args.limit));
    if (args.offset !== void 0) params.set("offset", String(args.offset));
    const qs = params.toString() ? `?${params}` : "";
    const body = await sbFetch(`/v0/settlement-requests${qs}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "get_settlement_request",
  {
    description: "Get a settlement request by ID. Shows full details including inbound/outbound payment status and payment instructions.",
    inputSchema: {
      id: import_zod.z.string().describe("Settlement request ID")
    }
  },
  async ({ id }) => {
    const body = await sbFetch(`/v0/settlement-requests/${id}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "update_settlement_status",
  {
    description: "Update the status of a settlement request.",
    inputSchema: {
      id: import_zod.z.string().describe("Settlement request ID"),
      status: import_zod.z.string().describe("New status value")
    }
  },
  async ({ id, status }) => {
    const body = await sbFetch(`/v0/settlement-requests/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "list_payments",
  {
    description: "List all payments. Shows ID, type, status, amount, and currency for each.",
    inputSchema: {
      limit: import_zod.z.number().int().min(1).max(100).optional().describe("Max results to return"),
      offset: import_zod.z.number().int().min(0).optional().describe("Pagination offset")
    }
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.limit !== void 0) params.set("limit", String(args.limit));
    if (args.offset !== void 0) params.set("offset", String(args.offset));
    const qs = params.toString() ? `?${params}` : "";
    const body = await sbFetch(`/v0/payments${qs}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "get_payment",
  {
    description: "Get a single payment by ID.",
    inputSchema: {
      id: import_zod.z.string().describe("Payment ID")
    }
  },
  async ({ id }) => {
    const body = await sbFetch(`/v0/payments/${id}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "create_disbursement",
  {
    description: "Create a disbursement to a whitelisted wallet address. The wallet_address must be pre-verified in the Superbank dashboard.",
    inputSchema: {
      wallet_address: import_zod.z.string().describe("Wallet address of a verified (whitelisted) destination"),
      amount: import_zod.z.string().describe("Disbursement amount as a string, e.g. '100.00'"),
      currency: import_zod.z.string().describe("Currency code, e.g. USDC, USDT")
    }
  },
  async (args) => {
    const body = await sbFetch("/v0/disbursements", {
      method: "POST",
      body: JSON.stringify(args)
    });
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "list_disbursements",
  {
    description: "List all disbursements.",
    inputSchema: {
      limit: import_zod.z.number().int().min(1).max(100).optional().describe("Max results to return"),
      offset: import_zod.z.number().int().min(0).optional().describe("Pagination offset")
    }
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.limit !== void 0) params.set("limit", String(args.limit));
    if (args.offset !== void 0) params.set("offset", String(args.offset));
    const qs = params.toString() ? `?${params}` : "";
    const body = await sbFetch(`/v0/disbursements${qs}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "get_disbursement",
  {
    description: "Get a single disbursement by ID.",
    inputSchema: {
      id: import_zod.z.string().describe("Disbursement ID")
    }
  },
  async ({ id }) => {
    const body = await sbFetch(`/v0/disbursements/${id}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "manage_webhooks",
  {
    description: "Manage Superbank webhook endpoints. Supports create, list, get, update, and delete actions.",
    inputSchema: {
      action: import_zod.z.enum(["create", "list", "get", "update", "delete"]).describe("Webhook operation to perform"),
      id: import_zod.z.string().optional().describe("Webhook endpoint ID (required for get, update, delete)"),
      url: import_zod.z.string().optional().describe(
        "HTTPS URL to receive webhook notifications (required for create; optional for update)"
      )
    }
  },
  async ({ action, id, url }) => {
    let body;
    switch (action) {
      case "create":
        if (!url) throw new Error("url is required for create action");
        body = await sbFetch("/v0/webhooks", {
          method: "POST",
          body: JSON.stringify({ url })
        });
        break;
      case "list":
        body = await sbFetch("/v0/webhooks");
        break;
      case "get":
        if (!id) throw new Error("id is required for get action");
        body = await sbFetch(`/v0/webhooks/${id}`);
        break;
      case "update":
        if (!id) throw new Error("id is required for update action");
        body = await sbFetch(`/v0/webhooks/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ url })
        });
        break;
      case "delete":
        if (!id) throw new Error("id is required for delete action");
        body = await sbFetch(`/v0/webhooks/${id}`, { method: "DELETE" });
        break;
    }
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
server.registerTool(
  "sandbox_transition",
  {
    description: "SANDBOX ONLY: Transition a payment or settlement request to a specific status for testing. Use this to walk through lifecycle states without real money movement.",
    inputSchema: {
      resource_type: import_zod.z.enum(["payment", "settlement_request"]).describe("Type of resource to transition"),
      id: import_zod.z.string().describe("Resource ID"),
      status: import_zod.z.string().describe(
        "Target status, e.g. COMPLETED, FAILED, PROCESSING, PAYOUT_FAILED, SETTLEMENT_COMPLETED"
      )
    }
  },
  async ({ resource_type, id, status }) => {
    if (ENV === "production") {
      throw new Error("sandbox_transition is only available in sandbox environment");
    }
    const path = resource_type === "payment" ? `/v0/sandbox/payments/${id}/status` : `/v0/sandbox/settlement-requests/${id}/status`;
    const body = await sbFetch(path, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);
var transport = new import_stdio.StdioServerTransport();
server.connect(transport).then(() => {
  process.stderr.write(
    `Superbank MCP running (env: ${ENV}, base: ${BASE_URL})
`
  );
});
