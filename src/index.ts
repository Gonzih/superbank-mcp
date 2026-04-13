#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.SUPERBANK_API_KEY;
if (!API_KEY) {
  process.stderr.write("SUPERBANK_API_KEY env var is required\n");
  process.exit(1);
}

const ENV = process.env.SUPERBANK_ENV ?? "sandbox";
const BASE_URL =
  ENV === "production"
    ? "https://api.superbank.co"
    : "https://api-sandbox.superbank.co";

async function sbFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "X-Api-Key": API_KEY!,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  const text = await res.text();
  let body: unknown;
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

function jsonText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ── Beneficiary address sub-schemas ───────────────────────────────────────────

const AddressSchema = z.object({
  country_code: z.string().describe("ISO 3166-1 alpha-2 country code, e.g. US"),
  street_line1: z.string(),
  street_line2: z.string().optional(),
  city: z.string(),
  state_region_or_province: z.string().optional(),
  postal_code: z.string().optional(),
});

const BeneficiarySchema = z.object({
  type: z.enum(["INDIVIDUAL", "BUSINESS"]).describe("Beneficiary type"),
  first_name: z.string().optional().describe("Required for INDIVIDUAL"),
  last_name: z.string().optional().describe("Required for INDIVIDUAL"),
  business_name: z.string().optional().describe("Required for BUSINESS"),
  email: z.string().optional(),
  address: AddressSchema.optional(),
});

const DestinationSchema = z.object({
  is_third_party: z.boolean().describe("Whether destination is a third party"),
  rail: z
    .string()
    .describe(
      "Payment rail: SOLANA, ETHEREUM, TRON, ACH, RTP, WIRE, SEPA, SPEI, NIBSS, etc."
    ),
  currency: z.string().describe("Currency code, e.g. USDC, USDT, USD, EUR"),
  wallet_address: z
    .string()
    .optional()
    .describe("Crypto wallet address (for crypto rails)"),
  bank_name: z.string().optional().describe("Bank name (for bank rails)"),
  account_number: z
    .string()
    .optional()
    .describe("Bank account number (ACH/WIRE/NIBSS)"),
  routing_number: z.string().optional().describe("ABA routing number (ACH/WIRE)"),
  iban: z.string().optional().describe("IBAN (SEPA)"),
  bic: z.string().optional().describe("BIC/SWIFT code (SEPA)"),
  clabe: z.string().optional().describe("CLABE (SPEI/Mexico)"),
  bank_code: z.string().optional().describe("Bank code (NIBSS/Nigeria)"),
  beneficiary: BeneficiarySchema.optional(),
});

// ── MCP Server setup ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: "superbank",
  version: "1.0.0",
});

// 1. create_settlement_request
server.registerTool(
  "create_settlement_request",
  {
    description:
      "Create a new Superbank settlement request (fiat→stablecoin, stablecoin→fiat, fiat→fiat, stablecoin→stablecoin). Returns payment instructions including wallet address or bank details.",
    inputSchema: {
      type: z.enum([
        "FIAT_TO_STABLECOIN",
        "STABLECOIN_TO_FIAT",
        "STABLECOIN_TO_STABLECOIN",
        "FIAT_TO_FIAT",
      ]).describe("Settlement transaction direction"),
      payment_reason: z
        .string()
        .describe(
          "Payment classification, e.g. REMITTANCES, EMPLOYEE_SALARIES_OR_WAGES, INVESTMENTS, TRADE_FINANCE, etc."
        ),
      amount: z.number().min(0.01).describe("Settlement amount (minimum 0.01)"),
      destination: DestinationSchema,
      source: z
        .object({
          currency: z.string().optional(),
          rail: z.string().optional(),
          wallet_address: z.string().optional(),
        })
        .optional()
        .describe("Optional source details for conversions"),
    },
  },
  async (args) => {
    const body = await sbFetch("/v0/settlement-requests", {
      method: "POST",
      body: JSON.stringify(args),
    });
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 2. list_settlement_requests
server.registerTool(
  "list_settlement_requests",
  {
    description:
      "List all settlement requests. Returns ID, type, status, amount, and created_at for each.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results to return (default 20)"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Pagination offset (default 0)"),
    },
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.limit !== undefined) params.set("limit", String(args.limit));
    if (args.offset !== undefined) params.set("offset", String(args.offset));
    const qs = params.toString() ? `?${params}` : "";
    const body = await sbFetch(`/v0/settlement-requests${qs}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 3. get_settlement_request
server.registerTool(
  "get_settlement_request",
  {
    description:
      "Get a settlement request by ID. Shows full details including inbound/outbound payment status and payment instructions.",
    inputSchema: {
      id: z.string().describe("Settlement request ID"),
    },
  },
  async ({ id }) => {
    const body = await sbFetch(`/v0/settlement-requests/${id}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 4. update_settlement_status
server.registerTool(
  "update_settlement_status",
  {
    description: "Update the status of a settlement request.",
    inputSchema: {
      id: z.string().describe("Settlement request ID"),
      status: z.string().describe("New status value"),
    },
  },
  async ({ id, status }) => {
    const body = await sbFetch(`/v0/settlement-requests/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 5. list_payments
server.registerTool(
  "list_payments",
  {
    description:
      "List all payments. Shows ID, type, status, amount, and currency for each.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results to return"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.limit !== undefined) params.set("limit", String(args.limit));
    if (args.offset !== undefined) params.set("offset", String(args.offset));
    const qs = params.toString() ? `?${params}` : "";
    const body = await sbFetch(`/v0/payments${qs}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 6. get_payment
server.registerTool(
  "get_payment",
  {
    description: "Get a single payment by ID.",
    inputSchema: {
      id: z.string().describe("Payment ID"),
    },
  },
  async ({ id }) => {
    const body = await sbFetch(`/v0/payments/${id}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 7. create_disbursement
server.registerTool(
  "create_disbursement",
  {
    description:
      "Create a disbursement to a whitelisted wallet address. The wallet_address must be pre-verified in the Superbank dashboard.",
    inputSchema: {
      wallet_address: z
        .string()
        .describe("Wallet address of a verified (whitelisted) destination"),
      amount: z.string().describe("Disbursement amount as a string, e.g. '100.00'"),
      currency: z.string().describe("Currency code, e.g. USDC, USDT"),
    },
  },
  async (args) => {
    const body = await sbFetch("/v0/disbursements", {
      method: "POST",
      body: JSON.stringify(args),
    });
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 8. list_disbursements
server.registerTool(
  "list_disbursements",
  {
    description: "List all disbursements.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results to return"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.limit !== undefined) params.set("limit", String(args.limit));
    if (args.offset !== undefined) params.set("offset", String(args.offset));
    const qs = params.toString() ? `?${params}` : "";
    const body = await sbFetch(`/v0/disbursements${qs}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 9. get_disbursement
server.registerTool(
  "get_disbursement",
  {
    description: "Get a single disbursement by ID.",
    inputSchema: {
      id: z.string().describe("Disbursement ID"),
    },
  },
  async ({ id }) => {
    const body = await sbFetch(`/v0/disbursements/${id}`);
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// 10. manage_webhooks
server.registerTool(
  "manage_webhooks",
  {
    description:
      "Manage Superbank webhook endpoints. Supports create, list, get, update, and delete actions.",
    inputSchema: {
      action: z
        .enum(["create", "list", "get", "update", "delete"])
        .describe("Webhook operation to perform"),
      id: z
        .string()
        .optional()
        .describe("Webhook endpoint ID (required for get, update, delete)"),
      url: z
        .string()
        .optional()
        .describe(
          "HTTPS URL to receive webhook notifications (required for create; optional for update)"
        ),
    },
  },
  async ({ action, id, url }) => {
    let body: unknown;
    switch (action) {
      case "create":
        if (!url) throw new Error("url is required for create action");
        body = await sbFetch("/v0/webhooks", {
          method: "POST",
          body: JSON.stringify({ url }),
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
          body: JSON.stringify({ url }),
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

// 11. sandbox_transition
server.registerTool(
  "sandbox_transition",
  {
    description:
      "SANDBOX ONLY: Transition a payment or settlement request to a specific status for testing. Use this to walk through lifecycle states without real money movement.",
    inputSchema: {
      resource_type: z
        .enum(["payment", "settlement_request"])
        .describe("Type of resource to transition"),
      id: z.string().describe("Resource ID"),
      status: z
        .string()
        .describe(
          "Target status, e.g. COMPLETED, FAILED, PROCESSING, PAYOUT_FAILED, SETTLEMENT_COMPLETED"
        ),
    },
  },
  async ({ resource_type, id, status }) => {
    if (ENV === "production") {
      throw new Error("sandbox_transition is only available in sandbox environment");
    }
    const path =
      resource_type === "payment"
        ? `/v0/sandbox/payments/${id}/status`
        : `/v0/sandbox/settlement-requests/${id}/status`;
    const body = await sbFetch(path, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    return { content: [{ type: "text", text: jsonText(body) }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  process.stderr.write(
    `Superbank MCP running (env: ${ENV}, base: ${BASE_URL})\n`
  );
});
