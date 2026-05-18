# MCP Hub — Technical & Business Documentation

> **Production-ready Zero-Trust middleware platform for governing, securing, and auditing AI agents across distributed microservices.**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Business Case](#2-business-case)
3. [System Architecture](#3-system-architecture)
4. [Core Components](#4-core-components)
5. [Zero-Trust Security Model](#5-zero-trust-security-model)
6. [Policy Engine](#6-policy-engine)
7. [Token & Session Management](#7-token--session-management)
8. [Tool Invocation Gateway](#8-tool-invocation-gateway)
9. [Audit Logging](#9-audit-logging)
10. [REST API Reference](#10-rest-api-reference)
11. [Sample Project — Booking System](#11-sample-project--booking-system)
12. [Dashboard & Admin UI](#12-dashboard--admin-ui)
13. [Data Models](#13-data-models)
14. [Deployment](#14-deployment)
15. [Security Considerations](#15-security-considerations)

---

## 1. Overview

MCP Hub is a **Model Context Protocol (MCP) middleware layer** that enforces Zero-Trust security principles on every AI agent interaction in a distributed system. It sits between AI agents (automated programs driven by LLMs or rules) and your microservices, ensuring that:

- Every agent has a verified identity before accessing any resource
- Access decisions are driven by explicit, configurable policy rules
- Every action — allowed or denied — is permanently audited
- AI tool calls (e.g. email generation via Groq LLM) are proxied and policy-controlled

**Technology Stack**

| Layer | Technology |
|---|---|
| Backend API | Node.js, Express.js |
| Database | MongoDB |
| Authentication | JWT (HS256), bcrypt |
| AI Provider | Groq (`llama-3.3-70b-versatile`) |
| Admin UI | React, Vite, Tailwind CSS |
| Sample Project | Node.js microservices (gateway, auth, booking) |

---

## 2. Business Case

### The Problem

Modern enterprise systems increasingly use AI agents to automate tasks — booking confirmations, data analysis, customer communication, workflow automation. These agents operate autonomously, often with broad API access, and traditional access control (API keys, role-based auth) was not designed for:

- **Ephemeral identities** — agents spin up and down dynamically
- **Tool-level granularity** — you need to control *which AI capability* an agent can use, not just which HTTP endpoint
- **Time-bound access** — agents should only operate during business hours or within a session window
- **Auditability** — every action must be traceable to an agent identity for compliance

### What MCP Hub Solves

| Business Need | MCP Hub Capability |
|---|---|
| Know which agent did what | Every request is tied to a unique agent identity + session ID |
| Prevent rogue AI actions | Default-deny policy engine blocks anything not explicitly allowed |
| Comply with audit requirements | Immutable MongoDB audit log with full request/response context |
| Control AI cost and usage | Rate limiting per agent; tool-level allow/deny; usage tracked per token |
| Govern AI tool access | Policy rules control which AI tools (e.g. `generate_email`) an agent can call |
| Time-restrict agent activity | Time-window conditions on policy rules (e.g. weekdays 08:00–18:00 UTC only) |
| Multi-project isolation | Project-scoped access — agent A cannot touch project B's resources |
| Developer self-service | API-key-based developer registration; manage agents via REST or UI |

### Who Uses This

- **Developers / DevOps** — register and configure agents via the MCP Hub Admin UI or REST API
- **Security / Compliance teams** — review audit logs; define and enforce policies
- **AI/ML engineers** — wire agents to call MCP tools instead of directly calling LLM APIs
- **Business stakeholders** — understand what AI automation is doing through the dashboard

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MCP HUB PLATFORM                                │
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   Admin UI       │    │   MCP Backend    │    │    MongoDB       │  │
│  │  (React/Vite)    │◄──►│  (Express REST)  │◄──►│  (mcphub DB)    │  │
│  │  port 5173       │    │  port 3001        │    │                  │  │
│  └──────────────────┘    └────────┬─────────┘    └──────────────────┘  │
│                                   │                                     │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │  validate-session / evaluate-policy
                                    │
┌───────────────────────────────────┼─────────────────────────────────────┐
│                    SAMPLE PROJECT (Booking System)                      │
│                                   │                                     │
│  ┌──────────────┐   X-Agent-Token │   ┌──────────────────────────────┐ │
│  │  Client App  │──────────────►  │   │      API Gateway             │ │
│  │  (React)     │                 └──►│  mcpAuth middleware           │ │
│  │  port 5174   │                     │  port 4000                   │ │
│  └──────────────┘                     └──────┬───────────────────────┘ │
│                                              │  forward + x-agent-id   │
│                                   ┌──────────▼──────────┐              │
│                                   │   Booking Service   │              │
│                                   │   port 4002         │              │
│                                   │                     │              │
│                                   │  POST /api/tools/   │              │
│                                   │  invoke (MCP Hub)   │              │
│                                   └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Request Flow (Happy Path)

1. Client sends request with `X-Agent-Token` header (MCP session JWT)
2. API Gateway `mcpAuth` middleware validates token against **MCP Hub** `/api/agents/validate-session`
3. MCP Hub checks: JWT signature → session not revoked → agent active → project scope → operation scope → service scope
4. If valid: attaches `req.agent` context; writes access log to MongoDB; forwards request downstream
5. Booking Service receives request, calls MCP Hub `/api/tools/invoke` for AI features
6. MCP Hub checks: API key → project ownership → **agent policy rules** (via `evaluatePolicy`) → calls Groq
7. AI result returned, full audit log written, response proxied back to client

---

## 4. Core Components

### 4.1 MCP Backend (`mura-mcp-backend/`)

The central hub — a Node.js/Express server that exposes the full REST API.

| Module | File | Purpose |
|---|---|---|
| Agent Auth | `src/auth/agentAuth.js` | Register, validate credentials, rotate secrets |
| Policy Engine | `src/auth/policyEngine.js` | Evaluate per-agent policy rules; build rule documents |
| Token Service | `src/auth/tokenService.js` | Issue/verify/refresh/revoke JWT session tokens |
| Zero Trust Middleware | `src/auth/zeroTrustMiddleware.js` | `withZeroTrust()` wrapper for MCP tool handlers |
| Agent Routes | `src/routes/agentRoutes.js` | CRUD + auth + session + policy management |
| Project Routes | `src/routes/projectRoutes.js` | Developer project management |
| Tool Routes | `src/routes/toolRoutes.js` | AI tool invocation gateway with policy enforcement |
| Logs Routes | `src/routes/logsRoutes.js` | Read-only audit log API with filtering and stats |

### 4.2 Admin UI (`mura-mcp-client/`)

A React SPA providing full management capabilities.

| Page | Route | Purpose |
|---|---|---|
| Login | `/login` | Developer sign-in via API key or credentials |
| Dashboard | `/` | Live stats — active agents, sessions, projects, blocked logs, tool activity |
| Agents | `/agents` | List, search, register agents |
| Agent Detail | `/agents/:agentId` | View identity, sessions, policy; generate tokens |
| Policy Editor | `/agents/:agentId/policy` | Manage rules, test simulator, quick templates |
| Projects | `/projects` | Create and manage projects |
| Audit Logs | `/logs` | Browse, filter, and inspect all access logs |

### 4.3 Sample Project (`sample-project/`)

A booking microservices demo showing how a real application integrates with MCP Hub.

| Service | Port | Purpose |
|---|---|---|
| API Gateway | 4000 | Entry point; enforces MCP agent token on all routes |
| Auth Service | 4001 | User registration and JWT login |
| Booking Service | 4002 | Booking CRUD + AI email generation via MCP |
| Client App | 5174 | React frontend for the booking system |

---

## 5. Zero-Trust Security Model

### Principles

**"Never trust, always verify"** — MCP Hub applies this to every single request:

1. **No implicit trust** — possession of a network token is not enough; the session is checked live in the database on every call
2. **Least privilege** — agents get only the tools, projects, and operations they explicitly need
3. **Assume breach** — every request is logged regardless of outcome; denied requests are logged too
4. **Policy-as-code** — access rules are structured data in MongoDB, not hardcoded logic

### The 10-Step Verification Chain (`withZeroTrust`)

For MCP tool calls routed through the Zero Trust wrapper:

```
Step 1  — Token present?          (MCP_AGENT_TOKEN or _token param)
Step 2  — JWT signature valid?    (HS256 verify with JWT_SECRET)
Step 3  — Token not expired?      (exp claim check)
Step 4  — Session not revoked?    (MongoDB agent_sessions lookup)
Step 5  — Agent still active?     (MongoDB agents collection check)
Step 6  — Policy evaluation       (agent_policies rules — default DENY)
Step 7  — Project scope           (merged into step 6 via conditions.projectIds)
Step 8  — Operation type          (merged into step 6 via conditions.operations)
Step 9  — Rate limit check        (sliding window: requests/minute in agent_audit_log)
Step 10 — Write audit log         (always — pass or fail)
```

### For HTTP Gateway Requests (`mcpAuth` middleware)

Requests to the sample-project API gateway go through:

```
1. Extract X-Agent-Token header
2. POST /api/agents/validate-session → MCP Hub verifies JWT + session
3. Check allowedProjects includes PROJECT_ID
4. Check allowedOperations (POST/PUT/DELETE require 'write' or 'admin')
5. Check allowedServices (maps URL path to service name)
6. If any check fails → log denied access → return 403
7. If all pass → attach req.agent context → proceed
```

---

## 6. Policy Engine

The policy engine is the **core authorization decision point**. It reads live rules from MongoDB so policy changes take effect immediately — no need to re-issue tokens.

### Rule Schema

```json
{
  "id": "rule_a1b2c3d4e5f6",
  "resource": "tool:generate_email",
  "effect": "allow",
  "conditions": {
    "projectIds": ["proj_abc123"],
    "operations": ["write"],
    "timeWindow": {
      "startHour": 8,
      "endHour": 18,
      "daysOfWeek": [1, 2, 3, 4, 5]
    }
  },
  "description": "Allow email generation on weekdays during business hours",
  "createdAt": "2026-05-16T00:00:00.000Z",
  "updatedAt": "2026-05-16T00:00:00.000Z"
}
```

### Resource Patterns

| Pattern | Matches |
|---|---|
| `tool:generate_email` | Exact tool name |
| `tool:*` | All tools (wildcard) |
| `tool:booking_*` | All tools starting with `booking_` |

### Evaluation Logic

- Rules are evaluated **top-down** — first match wins
- All conditions on a rule use **AND semantics** — all must pass for the rule to match
- If no rule matches → **default DENY**
- Explicit DENY rules can be placed above ALLOW rules to block specific cases first

### Example: Block email generation outside business hours

```
Rule 1: resource=tool:generate_email  effect=deny   conditions.timeWindow={startHour:18, endHour:8, daysOfWeek:[0,6]}
Rule 2: resource=tool:generate_email  effect=allow  conditions.projectIds=["proj_booking"]
Rule 3: resource=tool:*              effect=deny   (catch-all)
```

### Policy Simulator

The Admin UI Policy Editor (`/agents/:agentId/policy`) includes a live simulator where you can test a tool + project + operation combination against the agent's current rules and see which rule would match and what decision would be made — without making a real API call.

---

## 7. Token & Session Management

### Access Token (JWT)

- **Algorithm:** HS256
- **Default lifetime:** 1 hour (configurable via `SESSION_TIMEOUT` env var)
- **Requested lifetime:** Client can request up to 1 week via `requestedDurationMinutes`; capped by agent policy `maxSessionDurationMinutes`
- **Claims embedded:** `agentId`, `agentName`, `developerId`, `allowedTools`, `allowedProjects`, `allowedOperations`, `allowedServices`, `sessionContext`

```json
{
  "sub": "agent_abc123",
  "iss": "mcp-hub",
  "aud": "mcp-hub-tools",
  "iat": 1747353600,
  "exp": 1747357200,
  "jti": "sess_xyz789",
  "developerId": "dev_456",
  "agentName": "Booking Email Agent",
  "allowedTools": ["generate_email"],
  "allowedProjects": ["proj_booking_prod"],
  "allowedOperations": ["write"],
  "allowedServices": ["booking"],
  "sessionContext": "mcp-client"
}
```

### Refresh Token

- Opaque random token (never stored raw — bcrypt-hashed in DB)
- Lifetime: 7 days (configurable via `REFRESH_TIMEOUT`)
- Used via `POST /api/agents/refresh` to get a new access token without re-authenticating

### Session Lifecycle

```
POST /api/agents/authenticate
  │  agentId + agentSecret + context + requestedDurationMinutes
  ▼
issueSessionToken()
  ├─ Validate credentials (bcrypt verify secret hash)
  ├─ Determine token lifetime (min of: requested, policy max, config max, 1 week cap)
  ├─ Generate sessionId + refreshToken
  ├─ Store session in agent_sessions (hashed refresh token)
  └─ Return { accessToken, refreshToken, sessionId, expiresAt }

Every tool call:
  └─ verifyAccessToken()
       ├─ JWT verify (signature + expiry)
       └─ DB check: session exists + not revoked + agent active

POST /api/agents/refresh   — extend session using refresh token
POST /api/agents/revoke    — immediately invalidate session
```

---

## 8. Tool Invocation Gateway

MCP Hub acts as a **proxy between your services and AI providers**. Instead of calling Groq/OpenAI directly, your services call MCP Hub which:

1. Authenticates the caller (developer API key)
2. Resolves and validates the project context
3. **Evaluates agent policy rules** if the request originated from an agent (`x-agent-id` header)
4. Checks project-level `allowedTools` configuration
5. Executes the AI tool (Groq call)
6. Writes a full audit log including token usage, duration, model, and response
7. Returns the result + metadata

### Currently Supported Tools

| Tool | Description | Required Operation |
|---|---|---|
| `generate_email` | Generate professional booking notification emails using `llama-3.3-70b-versatile` | `write` |

### Adding a New Tool

1. Add to `TOOLS` registry in `toolRoutes.js`
2. Implement `executeYourTool(input, project)` function
3. Add a case in the `POST /invoke` handler
4. Define policy rules for agents that should be allowed to call it

### Tool Request Format

```http
POST /api/tools/invoke
Authorization: Bearer <developer-api-key>
X-Agent-Id: agent_abc123    ← forwarded from gateway; triggers policy check
Content-Type: application/json

{
  "tool": "generate_email",
  "projectId": "proj_booking_prod",
  "input": {
    "title": "Team Standup",
    "date": "2026-05-20T09:00:00Z",
    "location": "Conference Room A",
    "attendees": ["alice@example.com", "bob@example.com"],
    "status": "confirmed",
    "notes": "Please bring your weekly report"
  }
}
```

### Tool Response Format

```json
{
  "success": true,
  "tool": "generate_email",
  "result": "Subject: Booking Confirmation — Team Standup\n\nDear Team...",
  "meta": {
    "durationMs": 1243,
    "model": "llama-3.3-70b-versatile",
    "tokenUsage": {
      "promptTokens": 187,
      "completionTokens": 312,
      "totalTokens": 499
    },
    "loggedBy": "mcp-hub",
    "calledBy": "developer@example.com",
    "projectId": "proj_booking_prod",
    "projectName": "Booking System Production",
    "environment": "production",
    "timestamp": "2026-05-16T10:00:00.000Z"
  }
}
```

---

## 9. Audit Logging

Every request — authenticated, denied, or failed — is written to the `agent_action_logs` collection in MongoDB.

### Log Sources

| `source` | When written | Who writes it |
|---|---|---|
| `gateway_access` | Every validated request through the API gateway | `mcpAuth` middleware in api-gateway |
| `tool_invoke` | Every AI tool invocation (success, failure, or policy denial) | `toolRoutes.js` in MCP Hub |
| `gateway_access` (denied) | Every blocked request at the gateway | `logDeniedAccess()` in mcpAuth |

### Log Schema

```json
{
  "logId": "log_1747353600000_a1b2c3",
  "source": "tool_invoke",
  "agentId": "agent_abc123",
  "sessionId": "sess_xyz789",
  "developerId": "dev_456",
  "callerEmail": "developer@example.com",
  "tool": "generate_email",
  "action": "POST /bookings/b001/generate-email",
  "resource": "booking",
  "method": "POST",
  "path": "/bookings/b001/generate-email",
  "projectId": "proj_booking_prod",
  "projectName": "Booking System Production",
  "environment": "production",
  "allowed": true,
  "status": "success",
  "durationMs": 1243,
  "statusCode": 200,
  "ip": "127.0.0.1",
  "userAgent": "axios/1.6.0",
  "denyReason": null,
  "timestamp": "2026-05-16T10:00:00.000Z"
}
```

### Querying Logs

```http
GET /api/logs?projectId=proj_booking_prod&source=tool_invoke&limit=50
GET /api/logs?allowed=false&since=2026-05-01T00:00:00Z
GET /api/logs/stats?projectId=proj_booking_prod
```

---

## 10. REST API Reference

All endpoints require `Authorization: Bearer <api-key>` unless marked public.

### Developer / Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new developer account — returns API key |
| `POST` | `/api/auth/login` | Login with email/password — returns API key |

### Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents` | List all agents for the authenticated developer |
| `POST` | `/api/agents` | Register a new agent |
| `GET` | `/api/agents/sessions-summary` | Active session counts per agent |
| `GET` | `/api/agents/:agentId` | Get agent details |
| `PUT` | `/api/agents/:agentId` | Update agent name, description, policy |
| `DELETE` | `/api/agents/:agentId` | Deactivate agent |
| `POST` | `/api/agents/authenticate` | Issue session token (agentId + agentSecret) |
| `POST` | `/api/agents/validate-session` | Validate a live session token |
| `POST` | `/api/agents/refresh` | Refresh access token using refresh token |
| `POST` | `/api/agents/:agentId/revoke` | Revoke all sessions for an agent |
| `POST` | `/api/agents/:agentId/rotate-secret` | Rotate agent secret (invalidates sessions) |
| `POST` | `/api/agents/log-access` | Log a denied gateway access (public, fire-and-forget) |

### Policy

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents/:agentId/policy` | Get full policy document |
| `POST` | `/api/agents/:agentId/policy/rules` | Add a policy rule |
| `DELETE` | `/api/agents/:agentId/policy/rules/:ruleId` | Remove a rule |
| `PUT` | `/api/agents/:agentId/policy/rules` | Replace all rules |
| `POST` | `/api/agents/:agentId/policy/simulate` | Simulate a policy decision |

### Projects

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List developer's projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/:projectId` | Get project details |
| `PUT` | `/api/projects/:projectId` | Update project |
| `DELETE` | `/api/projects/:projectId` | Delete project |

### Tools

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/tools/list` | List available tools | Public |
| `POST` | `/api/tools/invoke` | Invoke an AI tool | API key |

### Logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/logs` | List audit logs (paginated, filterable) |
| `GET` | `/api/logs/stats` | Aggregated metrics (counts by tool, status, source) |
| `GET` | `/api/logs/:logId` | Full detail for a single log entry |

---

## 11. Sample Project — Booking System

The `sample-project/` directory demonstrates a complete integration. It is a multi-service booking application where AI agents control automated workflows.

### Architecture

```
Client (port 5174)
    │  X-Agent-Token: <mcp-jwt>
    │  Authorization: Bearer <user-jwt>
    ▼
API Gateway (port 4000)
    │  mcpAuth: validates agent token via MCP Hub
    │  requireUser: validates user JWT locally
    │  Forwards x-agent-id to downstream services
    │
    ├──► Auth Service (port 4001)   — user register/login
    └──► Booking Service (port 4002) — booking CRUD + email generation
              │
              │  POST /api/tools/invoke  (Bearer: MCP_API_KEY)
              │  x-agent-id: <forwarded from gateway>
              ▼
         MCP Hub (port 3001)
              └─ evaluatePolicy → Groq LLM → audit log → result
```

### Configuration (`.env` files)

**`api-gateway/.env`**
```env
MCP_URL=http://localhost:3001
PROJECT_ID=proj_your_booking_project_id
GATEWAY_PORT=4000
```

**`booking-service/.env`**
```env
MCP_URL=http://localhost:3001
MCP_API_KEY=your_developer_api_key
MCP_PROJECT_ID=proj_your_booking_project_id
BOOKING_SERVICE_PORT=4002
MONGO_URI=mongodb://localhost:27017/sample_project
```

### Setting Up an Agent for the Booking System

1. Register a developer account via MCP Hub Admin UI (`/register`)
2. Create a project for the booking system (`/projects`)
3. Register an agent for email automation (`/agents` → Register Agent)
4. Configure agent policy:
   - Resource: `tool:generate_email`
   - Effect: `allow`
   - Conditions: `projectIds: [your-project-id]`, `operations: [write]`
5. Generate a session token (`/agents/:id` → Generate Token)
6. Set `X-Agent-Token` in API calls from the booking client

---

## 12. Dashboard & Admin UI

The Admin UI (`mura-mcp-client/`) provides a complete management interface.

### Dashboard (`/`)

Real-time overview with:
- **Stat chips:** Total agents, active agents, live sessions, projects, recent blocked attempts
- **Tool Activity:** Invocation counts and average duration per tool
- **Active Agents panel:** Online/offline status, live session count per agent, allowed projects
- **Projects panel:** Environment badges (production/staging/development)
- **Blocked Access panel:** Recent denied requests with method, path, and deny reason

### Policy Editor (`/agents/:agentId/policy`)

- Full rule list with color-coded allow/deny cards
- **Add Rule modal** — resource selector, effect toggle, condition builder (project IDs, operations, time window picker with day selection)
- **Live Simulator** — test tool + project combinations against current rules instantly
- **Quick Templates** — one-click common patterns (allow all tools, deny outside hours, project-scoped access, read-only)

### Audit Logs (`/logs`)

- Filterable by source, project, date range, allow/deny status
- **Gateway access rows:** Shows agent ID, project name, duration, HTTP method
- **Tool invoke rows:** Shows tool name, model, token usage, duration
- Expandable detail drawer with full request/response context and deny reason

---

## 13. Data Models

### `agents` collection

```json
{
  "agentId": "agent_abc123",
  "name": "Booking Email Agent",
  "description": "Handles automated booking confirmation emails",
  "developerId": "dev_456",
  "secretHash": "<bcrypt>",
  "active": true,
  "policy": {
    "allowedTools": ["generate_email"],
    "allowedProjects": ["proj_booking_prod"],
    "allowedOperations": ["write"],
    "allowedServices": ["booking"],
    "maxSessionDurationMinutes": 480,
    "rateLimit": { "requestsPerMinute": 10 }
  },
  "authCount": 14,
  "lastAuthAt": "2026-05-16T09:00:00Z",
  "createdAt": "2026-05-01T00:00:00Z"
}
```

### `agent_policies` collection

```json
{
  "agentId": "agent_abc123",
  "policies": [
    {
      "id": "rule_a1b2c3",
      "resource": "tool:generate_email",
      "effect": "allow",
      "conditions": {
        "projectIds": ["proj_booking_prod"],
        "operations": ["write"],
        "timeWindow": { "startHour": 8, "endHour": 18, "daysOfWeek": [1,2,3,4,5] }
      },
      "description": "Allow email generation on weekdays",
      "createdAt": "2026-05-01T00:00:00Z",
      "updatedAt": "2026-05-01T00:00:00Z"
    },
    {
      "id": "rule_d4e5f6",
      "resource": "tool:*",
      "effect": "deny",
      "conditions": {},
      "description": "Default deny all other tools",
      "createdAt": "2026-05-01T00:00:00Z",
      "updatedAt": "2026-05-01T00:00:00Z"
    }
  ]
}
```

### `agent_sessions` collection

```json
{
  "sessionId": "sess_xyz789",
  "agentId": "agent_abc123",
  "developerId": "dev_456",
  "refreshTokenHash": "<bcrypt>",
  "revoked": false,
  "createdAt": "2026-05-16T09:00:00Z",
  "expiresAt": "2026-05-16T17:00:00Z",
  "refreshExpiresAt": "2026-05-23T09:00:00Z",
  "lastUsedAt": "2026-05-16T10:00:00Z",
  "sessionContext": "mcp-client"
}
```

### `projects` collection

```json
{
  "projectId": "proj_booking_prod",
  "name": "Booking System Production",
  "description": "Production booking microservices",
  "developerId": "dev_456",
  "environment": "production",
  "active": true,
  "mcpConfig": {
    "allowedTools": ["generate_email"],
    "services": [{ "type": "business", "name": "Booking Service", "url": "http://localhost:4002" }]
  },
  "createdAt": "2026-05-01T00:00:00Z"
}
```

### `api_keys` collection

```json
{
  "key": "zin_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "developerId": "dev_456",
  "email": "developer@example.com",
  "name": "Developer Name",
  "active": true,
  "createdAt": "2026-05-01T00:00:00Z",
  "lastUsed": "2026-05-16T10:00:00Z"
}
```

---

## 14. Deployment

### Environment Variables — MCP Backend

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server port |
| `MONGO_URI` | `mongodb://localhost:27017/mcphub` | MongoDB connection string |
| `JWT_SECRET` | — | **Required.** Min 32 chars. Signs all session tokens. |
| `SESSION_TIMEOUT` | `3600` | Access token lifetime in seconds |
| `REFRESH_TIMEOUT` | `604800` | Refresh token lifetime in seconds (7 days) |
| `BCRYPT_ROUNDS` | `10` | bcrypt work factor for hashing secrets |
| `GROQ_API_KEY` | — | Groq API key for LLM tool execution |

### Environment Variables — API Gateway

| Variable | Default | Description |
|---|---|---|
| `GATEWAY_PORT` | `4000` | Gateway port |
| `MCP_URL` | `http://localhost:3001` | MCP Hub base URL |
| `PROJECT_ID` | — | This gateway's project ID in MCP Hub |
| `AUTH_SERVICE_URL` | `http://localhost:4001` | Auth service internal URL |
| `BOOKING_SERVICE_URL` | `http://localhost:4002` | Booking service internal URL |

### Starting All Services

```bash
# 1. Start MongoDB
mongod

# 2. Start MCP Hub backend
cd mura-mcp-backend
npm install
npm start          # http://localhost:3001

# 3. Start Admin UI
cd mura-mcp-client
npm install
npm run dev        # http://localhost:5173

# 4. Start Sample Project
cd sample-project/auth-service && npm start      # port 4001
cd sample-project/booking-service && npm start   # port 4002
cd sample-project/api-gateway && npm start       # port 4000
cd sample-project/client && npm run dev          # port 5174
```

### Production Considerations

- Store `JWT_SECRET` in a secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Enable MongoDB authentication and TLS
- Put MCP Hub behind a reverse proxy (nginx/Caddy) with TLS termination
- Set `NODE_ENV=production` to suppress stack traces in API errors
- Use MongoDB TTL indexes on `agent_sessions.expiresAt` for automatic session cleanup
- Rate-limit the `/api/agents/authenticate` endpoint at the proxy layer to prevent brute force

---

## 15. Security Considerations

### What MCP Hub Does

- **Secrets never stored in plaintext** — agent secrets are bcrypt-hashed (10 rounds default); refresh tokens are bcrypt-hashed before storage
- **JWT with short lifetimes** — default 1 hour; configurable up to 1 week max
- **Stateful session revocation** — compromised tokens can be instantly invalidated via DB even before JWT expiry
- **Default-deny policy** — no access is granted unless explicitly permitted by a policy rule
- **Immutable audit trail** — logs are insert-only; no update or delete operations on `agent_action_logs`
- **Developer isolation** — agents, projects, and logs are scoped per `developerId`; cross-developer access is rejected

### Known Limitations / Future Work

- `JWT_SECRET` rotation requires re-issuing all active sessions (no key versioning yet)
- Policy rules are evaluated in order — large rule sets should be kept concise
- The `x-agent-id` header in tool invocations is trusted from the gateway — ensure the gateway is not publicly accessible except through your reverse proxy
- Refresh token rotation (single-use) is not yet implemented — consider adding for high-security environments

---

*Generated: May 2026 — MCP Hub v1.0*
*MSc Advanced Software Engineering — Zero-Trust AI Agents Research Project*
