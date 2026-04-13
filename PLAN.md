# PLAN: @gonzih/superbank-mcp

## Task
Build and publish a TypeScript MCP server for the Superbank instant liquidity API, plus a Claude Code skill file.

## Approach Options

### Option A: Single monolithic index.ts
All tools in one file. Simple, easy to maintain for small surface area.

### Option B: Tool-per-file modular structure
Each tool group in its own file, imported into main. Better separation for large projects.

### Option C: Auto-generated from OpenAPI spec
Use codegen. Overkill, no spec file provided.

**Chosen: Option A** — The API surface is well-defined (10 tools), single file keeps it simple and maintainable.

## Files to Touch
- `package.json`
- `tsconfig.json`
- `src/index.ts` — main MCP server
- `README.md`
- `skill.md`

## Implementation Details

### API Client
- Base URL: sandbox vs production from `SUPERBANK_ENV`
- Auth: `X-Api-Key` header
- All requests use native `fetch` (Node 18+)

### Tools
1. `create_settlement_request` — POST /v0/settlement-requests
2. `list_settlement_requests` — GET /v0/settlement-requests
3. `get_settlement_request` — GET /v0/settlement-requests/:id
4. `update_settlement_status` — PUT /v0/settlement-requests/:id/status
5. `list_payments` — GET /v0/payments
6. `get_payment` — GET /v0/payments/:id
7. `create_disbursement` — POST /v0/disbursements
8. `list_disbursements` — GET /v0/disbursements
9. `manage_webhooks` — CRUD via action param
10. `sandbox_transition` — PATCH sandbox status transitions

## Risks
- Webhook response schema incomplete from docs — implement defensively
- Sandbox sandbox endpoint path may differ (GET /v0/sandbox vs /v0/sandbox/info)
- npm publish requires logged-in npm account
