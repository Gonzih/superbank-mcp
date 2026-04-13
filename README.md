# @gonzih/superbank-mcp

Model Context Protocol (MCP) server for the [Superbank](https://www.superbank.co) instant liquidity API.

Superbank provides instant liquidity via API — eliminating pre-funding requirements for PSPs, neobanks, and on/off-ramp operators. Up to $25M/day, <3 second settlement, 24/7/365.

## Tools

| Tool | Description |
|------|-------------|
| `create_settlement_request` | Create fiat→stablecoin, stablecoin→fiat, fiat→fiat, or stablecoin→stablecoin settlement requests |
| `list_settlement_requests` | List all settlement requests with pagination |
| `get_settlement_request` | Get full details of a settlement request by ID |
| `update_settlement_status` | Update the status of a settlement request |
| `list_payments` | List all payments |
| `get_payment` | Get a single payment by ID |
| `create_disbursement` | Create a disbursement to a whitelisted wallet |
| `list_disbursements` | List all disbursements |
| `get_disbursement` | Get a single disbursement by ID |
| `manage_webhooks` | Full CRUD for webhook endpoints (action: create/list/get/update/delete) |
| `sandbox_transition` | Sandbox only: transition resource status for testing |

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPERBANK_API_KEY` | Yes | Your Superbank API key (`sk_sandbox_...` for sandbox) |
| `SUPERBANK_ENV` | No | `sandbox` (default) or `production` |

### Add to Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "superbank": {
      "command": "npx",
      "args": ["-y", "@gonzih/superbank-mcp"],
      "env": {
        "SUPERBANK_API_KEY": "sk_sandbox_your-key",
        "SUPERBANK_ENV": "sandbox"
      }
    }
  }
}
```

### Add to Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "superbank": {
      "command": "npx",
      "args": ["-y", "@gonzih/superbank-mcp"],
      "env": {
        "SUPERBANK_API_KEY": "sk_sandbox_your-key",
        "SUPERBANK_ENV": "sandbox"
      }
    }
  }
}
```

### Run Directly

```bash
SUPERBANK_API_KEY=sk_sandbox_your-key npx @gonzih/superbank-mcp
```

## Usage Examples

### Create a FIAT_TO_STABLECOIN settlement

```
Create a settlement request to send $99 USDC on Solana to wallet 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU for John Doe (john.doe@example.com) as remittances
```

The MCP will call `create_settlement_request` with:
```json
{
  "type": "FIAT_TO_STABLECOIN",
  "payment_reason": "REMITTANCES",
  "amount": 99,
  "destination": {
    "is_third_party": true,
    "rail": "SOLANA",
    "currency": "USDC",
    "wallet_address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "beneficiary": {
      "type": "INDIVIDUAL",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "address": {
        "country_code": "US",
        "street_line1": "123 Main St",
        "city": "New York",
        "state_region_or_province": "NY",
        "postal_code": "10001"
      }
    }
  }
}
```

### Test the sandbox flow

```
Walk me through a full settlement lifecycle test in sandbox
```

The MCP will:
1. Create a settlement request
2. Use `sandbox_transition` to advance it through states: PROCESSING → SETTLEMENT_COMPLETED → COMPLETED
3. Show the status at each step

### Set up a webhook

```
Set up a webhook to receive settlement events at https://my-app.com/hooks/superbank
```

## Development

```bash
git clone https://github.com/Gonzih/superbank-mcp
cd superbank-mcp
npm install
npm run build
SUPERBANK_API_KEY=sk_sandbox_your-key node dist/index.js
```

## License

MIT
