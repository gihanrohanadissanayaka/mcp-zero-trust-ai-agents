# MCP Hub Backend — API Documentation

**Version:** 2.0.0 (Zero Trust)
**Base URL:** `http://localhost:3001`
**Last Updated:** Phase 4 — Policy Engine

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication Model](#authentication-model)
3. [Developer Registration](#developer-registration)
4. [Agent Identity API (Phase 1)](#agent-identity-api-phase-1)
5. [Session Token API (Phase 2)](#session-token-api-phase-2)
6. [Zero Trust Middleware (Phase 3)](#zero-trust-middleware-phase-3)
7. [Policy Engine API (Phase 4)](#policy-engine-api-phase-4)
8. [MCP Admin Tools](#mcp-admin-tools)
9. [MCP Tool Reference](#mcp-tool-reference)
10. [Data Models](#data-models)
11. [Error Reference](#error-reference)

---

## Architecture Overview

```
AI Agent
   │
   ├─ 1. Authenticate → POST /api/agents/authenticate
   │        └── Returns: accessToken (JWT) + refreshToken
   │
   ├─ 2. MCP Tool Call (stdio / MCP protocol)
   │        └── params._token = <accessToken>
   │
   └─ 3. Zero Trust Middleware (10-step chain)
            ├─ Token validation (JWT verify)
            ├─ Session revocation check  (agent_sessions DB)
            ├─ Agent active check        (agents DB)
            ├─ Policy evaluation         (agent_policies DB)  ← Phase 4
            └─ Rate limit + Audit log
```

### Identity Hierarchy

```
Developer Account (mcphub_... API key)
  └── Agent (agt_... ID + bcrypt-hashed secret)
        └── Session (JWT access token + opaque refresh token)
```

---

## Authentication Model

### Developer Authentication
All agent management endpoints require a developer API key as a Bearer token:

```
Authorization: Bearer mcphub_<your_api_key>
```

Obtained by registering at `POST /api/auth/register`.

### Agent Authentication
AI agents authenticate with their `agentId` + `agentSecret` to receive a short-lived JWT access token:

```
POST /api/agents/authenticate
→ { accessToken, refreshToken }
```

The `accessToken` is passed as `_token` in every MCP tool call parameter or set as `MCP_AGENT_TOKEN` env var.

---

## Developer Registration

### `POST /api/auth/register`

Register a new developer account. Returns an API key used for all subsequent management calls.

**Request Body**
```json
{
  "name":    "Jane Smith",
  "email":   "jane@example.com",
  "password": "Str0ng!Pass",
  "company": "Acme Corp"
}
```

**Response `201`**
```json
{
  "success": true,
  "message": "Developer registered successfully",
  "developer": {
    "name":  "Jane Smith",
    "email": "jane@example.com",
    "id":    "64a1b2c3..."
  },
  "apiKey": "mcphub_abc123..."
}
```

> ⚠️ Store the `apiKey` immediately — it is not retrievable later.

---

## Agent Identity API (Phase 1)

All routes under `/api/agents/*` require developer authentication unless noted.

---

### `POST /api/agents/register`

Register a new AI agent under your developer account.

**Headers**
```
Authorization: Bearer mcphub_<dev_api_key>
Content-Type: application/json
```

**Request Body**
```json
{
  "name":        "My CI Bot",
  "description": "Reads use cases and scaffold suggestions for CI pipeline",
  "agentType":   "ci_bot",
  "policy": {
    "allowedTools":      ["usecases_search", "usecases_get"],
    "allowedProjects":   ["proj_abc123"],
    "allowedOperations": ["read"],
    "maxSessionDurationMinutes": 60,
    "rateLimit": {
      "requestsPerMinute": 30,
      "requestsPerHour":   300
    }
  }
}
```

**`agentType` values:** `ai_assistant` | `automation` | `ci_bot` | `data_pipeline` | `custom`

**`allowedOperations` values:** `read` | `write` | `admin`

**Response `201`**
```json
{
  "success": true,
  "message": "Agent registered successfully. Store the agentSecret securely — it will not be shown again.",
  "data": {
    "agentId":     "agt_abc123",
    "agentSecret": "ags_<64-char-hex>",
    "agent": {
      "agentId":     "agt_abc123",
      "name":        "My CI Bot",
      "description": "Reads use cases...",
      "agentType":   "ci_bot",
      "active":      true,
      "policy":      { ... },
      "createdAt":   "2026-03-21T10:00:00.000Z"
    }
  }
}
```

> ⚠️ `agentSecret` is shown **ONCE**. Store it in a vault or CI secret store immediately.

---

### `GET /api/agents`

List all agents belonging to your developer account.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "total": 2,
    "agents": [
      {
        "agentId":     "agt_abc123",
        "name":        "My CI Bot",
        "agentType":   "ci_bot",
        "active":      true,
        "policy":      { "allowedTools": [...], ... },
        "stats":       { "totalAuthAttempts": 5, "successfulAuths": 4 },
        "createdAt":   "2026-03-21T10:00:00.000Z",
        "lastAuthAt":  "2026-03-21T11:00:00.000Z"
      }
    ]
  }
}
```

---

### `GET /api/agents/:agentId`

Get full details for a specific agent including active session count.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "agentId":        "agt_abc123",
    "name":           "My CI Bot",
    "active":         true,
    "policy":         { ... },
    "activeSessions": 1
  }
}
```

---

### `PATCH /api/agents/:agentId/policy`

Update the high-level policy config for an agent (rebuilds `agent_policies` rules automatically).

**Request Body**
```json
{
  "policy": {
    "allowedTools":      ["usecases_search", "usecases_get", "analysis_impact"],
    "allowedProjects":   ["*"],
    "allowedOperations": ["read", "write"],
    "maxSessionDurationMinutes": 30,
    "rateLimit": {
      "requestsPerMinute": 60,
      "requestsPerHour":   500
    }
  }
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "Agent policy updated. Active sessions will use the new policy on next token refresh.",
  "data": {
    "agentId":       "agt_abc123",
    "updatedPolicy": { ... }
  }
}
```

---

### `POST /api/agents/:agentId/rotate-secret`

Rotate the agent secret. **All existing sessions are immediately revoked.** The agent must re-authenticate with the new secret.

**Request Body** — none required

**Response `200`**
```json
{
  "success": true,
  "message": "Agent secret rotated. All existing sessions have been revoked. Store the new secret securely.",
  "data": {
    "agentId":     "agt_abc123",
    "agentSecret": "ags_<new-64-char-hex>",
    "rotatedAt":   "2026-03-21T12:00:00.000Z"
  }
}
```

---

### `DELETE /api/agents/:agentId`

Permanently deactivate an agent and revoke all sessions.

**Response `200`**
```json
{
  "success": true,
  "message": "Agent agt_abc123 deactivated and 3 session(s) revoked.",
  "data": {
    "agentId":        "agt_abc123",
    "sessionsRevoked": 3
  }
}
```

---

### `DELETE /api/agents/:agentId/sessions`

Revoke all active sessions without deactivating the agent. The agent can still authenticate again.

**Response `200`**
```json
{
  "success": true,
  "message": "2 session(s) revoked for agent agt_abc123.",
  "data": {
    "agentId":        "agt_abc123",
    "sessionsRevoked": 2
  }
}
```

---

### `GET /api/agents/:agentId/sessions`

List all sessions (active and historical, last 50) for an agent.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "agentId": "agt_abc123",
    "sessions": [
      {
        "sessionId":     "sess_xyz789",
        "active":        true,
        "revoked":       false,
        "createdAt":     "2026-03-21T10:00:00.000Z",
        "expiresAt":     "2026-03-21T11:00:00.000Z",
        "lastUsedAt":    "2026-03-21T10:30:00.000Z",
        "revokedAt":     null,
        "revokedReason": null
      }
    ]
  }
}
```

---

## Session Token API (Phase 2)

---

### `POST /api/agents/authenticate`

Exchange `agentId` + `agentSecret` for a JWT access token. No developer auth required — this is called by the agent itself.

**Request Body**
```json
{
  "agentId":     "agt_abc123",
  "agentSecret": "ags_<64-char-hex>",
  "context":     "ci-pipeline-run-42"
}
```

**Response `200`**
```json
{
  "success":      true,
  "message":      "Authentication successful. Include the accessToken as Bearer in MCP tool calls.",
  "accessToken":  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "reft_<opaque-token>",
  "sessionId":    "sess_xyz789",
  "tokenType":    "Bearer",
  "expiresIn":    3600,
  "expiresAt":    "2026-03-21T11:00:00.000Z",
  "agent": {
    "agentId":   "agt_abc123",
    "name":      "My CI Bot",
    "agentType": "ci_bot"
  }
}
```

**JWT Payload Claims**
| Claim | Description |
|-------|-------------|
| `sub` | agentId |
| `jti` | sessionId |
| `developerId` | Developer account ID |
| `agentName` | Agent display name |
| `allowedTools` | Array of permitted tool names |
| `allowedProjects` | Array of permitted project IDs (or `["*"]`) |
| `allowedOperations` | `["read"]`, `["read","write"]`, etc. |
| `exp` | Unix timestamp expiry |

---

### `POST /api/agents/refresh`

Exchange a refresh token for a new access token. The old refresh token is **rotated** (invalidated). Store the new one.

**Request Body**
```json
{
  "refreshToken": "reft_<opaque-token>"
}
```

**Response `200`** — same shape as `/authenticate`

---

### `POST /api/agents/revoke-session`

Revoke a specific session by ID. No developer auth required — agent can call this to log itself out.

**Request Body**
```json
{
  "sessionId": "sess_xyz789",
  "reason":    "agent_logout"
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "Session sess_xyz789 revoked.",
  "data": {
    "sessionId": "sess_xyz789",
    "revoked":   true
  }
}
```

---

### `POST /api/agents/introspect`

Inspect any token's claims and live revocation status. Requires developer auth.

**Request Body**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "valid":    true,
    "active":   true,
    "expired":  false,
    "revoked":  false,
    "claims": {
      "sub":               "agt_abc123",
      "jti":               "sess_xyz789",
      "agentName":         "My CI Bot",
      "allowedTools":      ["usecases_search"],
      "allowedProjects":   ["proj_abc123"],
      "allowedOperations": ["read"],
      "iat":               1742555200,
      "exp":               1742558800
    }
  }
}
```

---

## Zero Trust Middleware (Phase 3)

Every MCP tool call passes through a 10-step check chain. Steps are evaluated in order — the first failure returns an error immediately.

| Step | Check | DB Hit |
|------|-------|--------|
| 1 | `_token` param or `MCP_AGENT_TOKEN` env var present | — |
| 2 | JWT HS256 signature valid | — |
| 3 | Token not expired (`exp` claim) | — |
| 4 | Session not revoked | `agent_sessions` |
| 5 | Agent is active | `agents` |
| 6–8 | Policy engine evaluation (tool + project + operation) | `agent_policies` |
| 9 | Rate limit not exceeded (sliding window) | `agent_audit_log` |
| 10 | Write audit log entry | `agent_audit_log` |

### Using the Token in MCP Calls

**Option A — per-call param (recommended):**
```json
{
  "name": "usecases_search",
  "arguments": {
    "_token": "eyJhbGciOi...",
    "query": "user authentication"
  }
}
```

**Option B — environment variable (for persistent agents):**
```bash
MCP_AGENT_TOKEN=eyJhbGciOi... node my-agent.js
```

---

## Policy Engine API (Phase 4)

Fine-grained rule management for individual agents. Rules are evaluated **top-down, first-match-wins**. Default is **DENY** if no rule matches.

### Rule Schema

```json
{
  "id":       "rule_a1b2c3",
  "resource": "tool:usecases_search",
  "effect":   "allow",
  "conditions": {
    "projectIds": ["proj_abc123"],
    "operations": ["read"],
    "timeWindow": {
      "startHour":  8,
      "endHour":   18,
      "daysOfWeek": [1, 2, 3, 4, 5]
    }
  },
  "description": "Allow search during business hours (UTC) on weekdays",
  "createdAt": "2026-03-21T10:00:00.000Z",
  "updatedAt": "2026-03-21T10:00:00.000Z"
}
```

**`resource` patterns:**
| Pattern | Matches |
|---------|---------|
| `tool:usecases_search` | Only that specific tool |
| `tool:*` | Any tool (wildcard catch-all) |
| `tool:usecases_*` | Any tool starting with `usecases_` |

**Conditions** — all must pass (AND logic):
| Field | Description |
|-------|-------------|
| `projectIds` | Array of allowed project IDs. Empty or omitted = any project. Use `["*"]` for explicit wildcard. |
| `operations` | `["read"]`, `["read","write"]`, `["admin"]` |
| `timeWindow` | UTC hour range (`startHour`/`endHour`) + optional `daysOfWeek` (0=Sun…6=Sat) |

---

### `GET /api/agents/:agentId/policy`

Retrieve the full ordered rule set for an agent.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "agentId":   "agt_abc123",
    "agentName": "My CI Bot",
    "ruleCount": 3,
    "policies": [
      {
        "id": "rule_a1b2c3",
        "resource": "tool:usecases_search",
        "effect":   "allow",
        "conditions": { "projectIds": ["proj_abc123"], "operations": ["read"] },
        "description": "Allow searches on project"
      },
      {
        "id": "rule_d4e5f6",
        "resource": "tool:*",
        "effect":   "deny",
        "conditions": {},
        "description": "Default deny — catch-all, never remove"
      }
    ],
    "updatedAt": "2026-03-21T10:00:00.000Z"
  }
}
```

---

### `POST /api/agents/:agentId/policy/rules`

Add a single rule (inserted before the catch-all deny).

**Request Body**
```json
{
  "resource":    "tool:analysis_impact",
  "effect":      "allow",
  "conditions":  {
    "projectIds": ["*"],
    "operations": ["read"]
  },
  "description": "Allow impact analysis on any project"
}
```

**Response `201`**
```json
{
  "success": true,
  "message": "Policy rule added",
  "data": {
    "rule": {
      "id":          "rule_g7h8i9",
      "resource":    "tool:analysis_impact",
      "effect":      "allow",
      "conditions":  { "projectIds": ["*"], "operations": ["read"] },
      "description": "Allow impact analysis on any project",
      "createdAt":   "2026-03-21T12:00:00.000Z",
      "updatedAt":   "2026-03-21T12:00:00.000Z"
    }
  }
}
```

---

### `DELETE /api/agents/:agentId/policy/rules/:ruleId`

Remove a rule by its ID. The catch-all `tool:*` deny rule cannot be removed.

**Response `200`**
```json
{
  "success": true,
  "message": "Rule 'rule_a1b2c3' removed",
  "data": {
    "removed": true,
    "ruleId":  "rule_a1b2c3"
  }
}
```

---

### `PUT /api/agents/:agentId/policy/rules`

Replace the **entire** rule set. A catch-all deny is appended automatically if not provided.

**Request Body**
```json
{
  "rules": [
    {
      "resource":   "tool:usecases_search",
      "effect":     "allow",
      "conditions": { "projectIds": ["proj_abc123"], "operations": ["read"] }
    },
    {
      "resource":   "tool:usecases_get",
      "effect":     "allow",
      "conditions": { "projectIds": ["proj_abc123"], "operations": ["read"] }
    }
  ]
}
```

**Response `200`**
```json
{
  "success":   true,
  "message":   "Policy replaced with 3 rules",
  "data": {
    "ruleCount": 3,
    "policies":  [ ... ]
  }
}
```

---

### `POST /api/agents/:agentId/policy/simulate`

Dry-run the policy engine for a given tool + context without making a real tool call.

**Request Body**
```json
{
  "toolName":  "usecases_search",
  "operation": "read",
  "projectId": "proj_abc123"
}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "simulation":  true,
    "agentId":     "agt_abc123",
    "toolName":    "usecases_search",
    "context":     { "operation": "read", "projectId": "proj_abc123" },
    "decision":    "allow",
    "matchedRule": {
      "id":          "rule_a1b2c3",
      "resource":    "tool:usecases_search",
      "effect":      "allow",
      "description": "Allow searches on project"
    },
    "reason":      "matched_rule:rule_a1b2c3",
    "allRules":    [ ... ],
    "evaluatedAt": "2026-03-21T12:00:00.000Z"
  }
}
```

---

## MCP Admin Tools

These three MCP tools are registered on the MCP server (called via stdio, not HTTP). They require `admin` permission in the calling agent's policy.

---

### `agent_audit_query`

Query the live audit log with filters.

**Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `_token` | string | see note | JWT access token |
| `agentId` | string | no | Filter by agent |
| `tool` | string | no | Filter by tool name |
| `decision` | `"allow"` \| `"deny"` | no | Filter by decision |
| `projectId` | string | no | Filter by project |
| `since` | ISO 8601 string | no | Start of time range |
| `until` | ISO 8601 string | no | End of time range |
| `limit` | integer 1–500 | no | Max results (default 100) |
| `skip` | integer | no | Pagination offset |

**Returns**
```json
{
  "pagination": { "total": 142, "returned": 100, "skip": 0, "limit": 100 },
  "summary":    { "allows": 130, "denies": 12, "denyRate": "8.5%" },
  "entries": [
    {
      "agentId":     "agt_abc123",
      "tool":        "usecases_search",
      "decision":    "allow",
      "durationMs":  45,
      "timestamp":   "2026-03-21T11:00:00.000Z"
    }
  ]
}
```

---

### `agent_policy_update`

Manage policy rules for any of your agents via API.

**Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `_token` | string | see note | JWT access token |
| `action` | `"get"` \| `"add"` \| `"remove"` \| `"replace"` \| `"simulate"` | YES | Action to perform |
| `agentId` | string | YES | Target agent |
| `rule` | object | for `add` | Rule to add |
| `rules` | array | for `replace` | Complete rule set |
| `ruleId` | string | for `remove` | ID of rule to remove |
| `toolName` | string | for `simulate` | Tool to test |
| `operation` | string | for `simulate` | Operation to test |

---

### `agent_session_revoke`

Emergency kill switch for agent sessions.

**Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `_token` | string | see note | JWT access token |
| `agentId` | string | YES | Target agent |
| `sessionId` | string | no | Specific session; omit to revoke ALL |
| `reason` | string | no | Audit log reason (default: `admin_revoke`) |

---

## MCP Tool Reference

All tools pass through Zero Trust middleware. Include `_token` in every call.

| Tool | Operation | Description |
|------|-----------|-------------|
| `usecases_search` | read | Full-text search across use cases |
| `usecases_get` | read | Retrieve a specific use case by ID |
| `analysis_impact` | read | Analyse files impacted by a feature |
| `scaffold_create` | write | Generate scaffold files for a feature |
| `usecases_upsert` | write | Create or update a use case |
| `api_document_link` | write | Link API documentation to a use case |
| `project_bootstrap` | write | Bootstrap a new project structure |
| `feature_automation` | write | Full automation: search → analyse → scaffold |
| `feature_request_automation` | write | Feature request → scaffold pipeline |
| `usecase_sync_automation` | write | Sync use cases with project state |
| `agent_audit_query` | admin | Query audit log (Phase 4 admin) |
| `agent_policy_update` | admin | Manage policy rules (Phase 4 admin) |
| `agent_session_revoke` | admin | Emergency session kill (Phase 4 admin) |

---

## Data Models

### Agent Document (`agents` collection)
```json
{
  "_id":           "ObjectId",
  "agentId":       "agt_<nanoid>",
  "developerId":   "ObjectId",
  "name":          "string",
  "description":   "string",
  "agentType":     "ai_assistant | automation | ci_bot | data_pipeline | custom",
  "secretHash":    "bcrypt hash",
  "active":        true,
  "policy": {
    "allowedTools":              ["string"],
    "allowedProjects":           ["string"],
    "allowedOperations":         ["read", "write", "admin"],
    "maxSessionDurationMinutes": 30,
    "rateLimit": {
      "requestsPerMinute": 60,
      "requestsPerHour":   500
    }
  },
  "stats": {
    "totalAuthAttempts":  0,
    "successfulAuths":    0,
    "failedAuths":        0,
    "totalToolCalls":     0
  },
  "createdAt":  "Date",
  "lastAuthAt": "Date",
  "lastUsedAt": "Date"
}
```

### Session Document (`agent_sessions` collection)
```json
{
  "sessionId":       "sess_<nanoid>",
  "agentId":         "agt_...",
  "developerId":     "ObjectId",
  "refreshTokenHash":"bcrypt hash",
  "revoked":         false,
  "expiresAt":       "Date",
  "createdAt":       "Date",
  "lastUsedAt":      "Date",
  "revokedAt":       null,
  "revokedReason":   null,
  "sessionContext":  "mcp-client"
}
```

### Policy Document (`agent_policies` collection)
```json
{
  "agentId":    "agt_...",
  "developerId":"ObjectId",
  "policies": [
    {
      "id":          "rule_<hex>",
      "resource":    "tool:usecases_search",
      "effect":      "allow | deny",
      "conditions":  {
        "projectIds": ["proj_..."],
        "operations": ["read"],
        "timeWindow": {
          "startHour":  8,
          "endHour":   18,
          "daysOfWeek": [1, 2, 3, 4, 5]
        }
      },
      "description": "string",
      "createdAt":   "Date",
      "updatedAt":   "Date"
    }
  ],
  "updatedAt": "Date"
}
```

### Audit Log Entry (`agent_audit_log` collection)
```json
{
  "agentId":        "agt_...",
  "developerId":    "ObjectId",
  "sessionId":      "sess_...",
  "tool":           "usecases_search",
  "decision":       "allow | deny",
  "denyReason":     null,
  "policyRule":     { "id": "rule_...", "resource": "...", "effect": "allow" },
  "params":         { "query": "auth" },
  "durationMs":     42,
  "responseStatus": "success | error",
  "errorMessage":   null,
  "timestamp":      "Date"
}
```

---

## Error Reference

### HTTP Error Responses
All error responses follow:
```json
{
  "success": false,
  "error":   "Human-readable error message"
}
```

### MCP Tool Error Responses
All denied tool calls return:
```json
{
  "content": [{ "type": "text", "text": "<JSON below>" }],
  "isError": true
}
```

```json
{
  "error":   "ERROR_CODE",
  "message": "Human-readable description",
  "hint":    "Actionable next step"
}
```

### Error Codes (MCP)
| Code | HTTP Equiv | Description |
|------|-----------|-------------|
| `MISSING_TOKEN` | 401 | No `_token` param and no `MCP_AGENT_TOKEN` env var |
| `TOKEN_EXPIRED` | 401 | JWT `exp` claim has passed — use refresh token |
| `AUTH_FAILED` | 401 | JWT signature invalid, session revoked, or agent inactive |
| `NO_POLICY_DEFINED` | 403 | Agent has no policy rules configured |
| `POLICY_DENIED` | 403 | Policy evaluated and returned DENY |
| `RATE_LIMIT_EXCEEDED` | 429 | Sliding-window rate limit hit |
| `TOOL_EXECUTION_ERROR` | 500 | Tool handler threw an exception |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URL` | required | MongoDB connection string |
| `DB_NAME` | required | MongoDB database name |
| `JWT_SECRET` | required | HS256 signing secret (min 32 chars) |
| `SESSION_TIMEOUT` | `3600` | Access token TTL in seconds |
| `REFRESH_TIMEOUT` | `604800` | Refresh token TTL in seconds (7 days) |
| `BCRYPT_ROUNDS` | `10` | bcrypt cost factor |
| `API_PORT` | `3001` | HTTP API server port |
| `SKIP_API_SERVER` | — | Set to `true` to disable the HTTP side server |
| `MCP_AGENT_TOKEN` | — | Set by agent instead of passing `_token` per call |
