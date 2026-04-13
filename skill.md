---
name: superbank
description: Manage Superbank liquidity — create settlement requests, check payments, manage disbursements
---

Use the superbank MCP tools to help with instant liquidity operations.

When the user asks to:
- "send $X to [address]" → use create_settlement_request
- "check payment status" → use get_payment or get_settlement_request
- "list recent settlements" → use list_settlement_requests
- "create disbursement" → use create_disbursement
- "test settlement flow" → use sandbox_transition to walk through status transitions
- "set up webhook" → use manage_webhooks with action: create

Always confirm the environment (sandbox vs production) before creating or updating anything.
Show amounts in human-readable format with currency.
