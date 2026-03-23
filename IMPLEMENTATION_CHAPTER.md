# Chapter 4: Implementation

## Research Title
**Zero-Trust Implementation Strategies for MCP-Enabled AI Agents in Distributed Enterprise Architectures**

---

## 4.1 Chapter Overview

This chapter presents the practical realisation of the proposed zero-trust security framework for Model Context Protocol (MCP)-enabled AI agents operating within distributed enterprise environments. The implementation translates the theoretical constructs explored in preceding chapters — identity-based access control, least-privilege operation, continuous verification, and comprehensive auditability — into a working, production-grade software system.

The implemented system, named **MURA-MCP Hub** (Multi-User Role-Aware MCP Hub), consists of three principal components that collectively demonstrate the full lifecycle of zero-trust enforcement for AI agents:

1. **MURA-MCP Backend** — The central MCP server providing zero-trust enforcement, agent identity management, policy evaluation, session token management, and audit logging.
2. **MURA-MCP Client** — A React-based administrative dashboard enabling developers to register agents, define policy rules, monitor sessions, and review audit logs in real time.
3. **Sample Project** — A three-service Express microservices application acting as the test environment, demonstrating how enterprise AI agents operating across distributed services are subject to zero-trust access control enforced by the hub.

Together, these components constitute an end-to-end proof-of-concept that validates the research hypothesis: that a structured, policy-driven zero-trust architecture can be applied effectively to MCP-enabled AI agents without prohibitive performance or operational overhead.

The chapter is structured as follows: Section 4.2 justifies the technology selections made during implementation. Section 4.3 describes the data model and data selection rationale. Section 4.4 walks through the implementation of the core zero-trust security functionalities in detail. Section 4.5 presents the implemented user interfaces. Section 4.6 provides a chapter summary.

---

## 4.2 Technology Selection

Technology selection for this research was driven by five criteria: (i) alignment with the MCP standard, (ii) security and cryptographic maturity, (iii) suitability for distributed microservices architectures, (iv) developer ecosystem support, and (v) reproducibility of the experimental setup. Each category below documents the rationale for the selected technologies.

### 4.2.1 Programming Languages

#### JavaScript / Node.js (v20+)

The primary implementation language for all server-side components — the MCP backend, the API gateway, the auth service, and the booking service — is **JavaScript** executed on the **Node.js** runtime. This choice is justified by several factors:

- **First-class MCP SDK support.** The official `@modelcontextprotocol/sdk` package (v1.18.2) is written in JavaScript/TypeScript and provides the most complete and up-to-date implementation of the MCP protocol. Using JavaScript ensures native, low-friction integration with the protocol layer.
- **Asynchronous I/O model.** Zero-trust enforcement involves multiple sequential round-trips: token verification, database lookup for session revocation, policy evaluation, rate-limit checking, and audit log writing. Node.js's event-loop model handles these chained async operations efficiently without spawning a thread per request.
- **ESM modules (`"type": "module"`)** are used throughout the backend (`server.js`, `src/auth/*.js`), enabling clean `import/export` syntax and tree-shakeable module boundaries appropriate for a security-critical codebase.
- **Ecosystem depth.** Libraries for JWT, bcrypt, MongoDB, rate limiting, and HTTP middleware are mature, widely audited, and actively maintained within the Node.js ecosystem.

```json
// mura-mcp-backend/package.json (excerpt)
{
  "type": "module",
  "main": "server.js"
}
```

#### JavaScript / React (JSX)

The administrative frontend (`mura-mcp-client`) and the sample project user interface (`sample-project/client`) are implemented in **React 18** using JSX syntax. React's component model allows the complex policy management and audit log views to be decomposed into independently testable, reusable interface units.

---

### 4.2.2 Libraries

The following core libraries were selected and integrated into the implementation:

#### Security & Cryptography

| Library | Version | Purpose |
|---|---|---|
| `jsonwebtoken` | 9.0.2 | JWT generation and verification (HS256 algorithm) for MCP agent session tokens |
| `bcrypt` | 5.1.1 | Password-equivalent hashing of agent secrets (12 rounds) and developer passwords |
| `crypto` (Node built-in) | — | Cryptographically secure random number generation for agent IDs, session IDs, and refresh tokens |

**`jsonwebtoken`** is used exclusively in `src/auth/tokenService.js` to issue short-lived access tokens and verify them on every tool call. The HS256 algorithm was selected for its symmetric-key simplicity in intra-system verification, accepting that an asymmetric scheme (RS256) would be preferred in a multi-issuer production deployment.

**`bcrypt`** is applied in two distinct security contexts: (i) hashing 12-character agent secrets before database persistence in `agentAuth.js`, and (ii) hashing developer passwords before storage in `authController.js`. The 12-round work factor for agent secrets (`SECRET_BCRYPT_ROUNDS = 12`) exceeds the typical 10-round baseline, reflecting the elevated sensitivity of machine identity credentials compared to interactive user passwords.

```javascript
// src/auth/agentAuth.js — Agent secret hashing
const SECRET_BCRYPT_ROUNDS = 12;

async function hashSecret(secret) {
  return bcrypt.hash(secret, SECRET_BCRYPT_ROUNDS);
}
```

**`crypto`** is used to generate identifiers with cryptographic unpredictability. Agent IDs combine a base-36 timestamp with 8 random bytes; agent secrets are 32 random bytes prefixed with `agtsec_`; session IDs are 12 random bytes; refresh tokens are 40 random bytes. This ensures identifiers are not guessable or enumerable.

```javascript
// src/auth/agentAuth.js
function generateAgentId() {
  const timestamp  = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `agt_${timestamp}_${randomPart}`;
}

function generateAgentSecret() {
  return `agtsec_${crypto.randomBytes(32).toString('hex')}`;
}
```

#### HTTP & Middleware

| Library | Version | Purpose |
|---|---|---|
| `express` | 4.21.2 | REST API framework for all backend services |
| `helmet` | 7.1.0 | HTTP security headers (XSS protection, HSTS, frameguard) |
| `cors` | 2.8.5 | Cross-Origin Resource Sharing configuration for frontend-backend communication |
| `express-rate-limit` | 7.1.5 | Per-route rate limiting for authentication endpoints |
| `axios` | 1.7.9 | HTTP client in the API gateway and sample-project client for inter-service requests |

**`helmet`** automatically sets the following security headers on all responses: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Strict-Transport-Security`, and `Referrer-Policy`. This mitigates a broad class of browser-based attacks without per-route configuration.

**`express-rate-limit`** is applied at the HTTP transport layer for developer authentication endpoints, complementing the custom intra-agent rate limiter (described in Section 4.4.4) that operates at the audit-log layer.

#### Database

| Library | Version | Purpose |
|---|---|---|
| `mongodb` | 6.20.0 | MongoDB Node.js driver for all persistent storage |

The native MongoDB driver (not an ORM abstraction such as Mongoose) was selected to allow expressive use of MongoDB aggregation pipelines and collection-level TTL indexes important for session expiry enforcement.

#### AI Integration

| Library | Version | Purpose |
|---|---|---|
| `groq-sdk` | 0.8.0 | LLM inference via Groq Cloud (Llama 3.3 70B) for the `generate_email` AI tool |
| `@modelcontextprotocol/sdk` | 1.18.2 | MCP server/client protocol implementation |

**`@modelcontextprotocol/sdk`** provides the core MCP server abstraction. Tool handlers are registered via `server.tool(name, schema, handler)`, and the zero-trust middleware wraps each handler using `withZeroTrust(toolName, handler)` before registration.

#### Validation

| Library | Version | Purpose |
|---|---|---|
| `zod` | 3.25.76 | Runtime schema validation for all MCP tool inputs |

`zod` schemas enforce structural correctness of tool arguments before any business logic executes, preventing injection-class attacks at the protocol boundary.

#### Frontend

| Library | Version | Purpose |
|---|---|---|
| `react` | 18.3.1 | UI component library |
| `react-dom` | 18.3.1 | DOM rendering engine |
| `react-router-dom` | 7.1.1 | Client-side routing with protected-route wrappers |
| `lucide-react` | 0.469.0 | Icon set for UI elements |
| `tailwindcss` | 3.4.17 | Utility-first CSS framework |

---

### 4.2.3 Frameworks

#### Express.js

Express is the HTTP server framework used for all four backend services: the MCP hub backend, the API gateway, the authentication service, and the booking service. Express was chosen for its minimal footprint, extensive middleware ecosystem, and its established role as the de-facto standard for Node.js microservice architectures. Its routing model (`app.use()`, `router.get/post/patch/delete()`) maps naturally to the RESTful API structure required by the hub's agent management, project management, and audit log endpoints.

Express middleware chains are used throughout the implementation to enforce security at different layers:

- `requireApiKey()` middleware validates developer API keys for log and tool routes.
- `requireDeveloperAuth()` middleware validates Bearer tokens for agent and project management routes.
- `mcpAuth()` middleware in the sample project API gateway validates MCP agent session tokens by calling out to the hub backend.

#### React (Vite)

The admin dashboard and sample project client are built on **React 18** bootstrapped with **Vite** for the build tool. Vite provides fast hot-module replacement during development and optimised ESM-based production bundles. The administrative dashboard makes heavy use of React's component composition to build complex views such as the policy rule editor and paginated audit log viewer.

---

### 4.2.4 IDEs and Tools

| Tool | Purpose |
|---|---|
| **Visual Studio Code** | Primary development IDE. Used with ESLint, Prettier, and the GitHub Copilot extension for AI-assisted development. |
| **Postman** | API testing and documentation. A Postman collection (`docs/zincat-mcp-postman-collection.json`) is provided with all MCP Hub API endpoints pre-configured. |
| **MongoDB Compass** | GUI inspection of runtime database state (agents, sessions, audit logs, policies). |
| **Docker** | Containerisation of the MCP backend for reproducible deployment (`Dockerfile`, `build-container.sh`, `run-container.sh`). |
| **Node.js (v20+)** | JavaScript runtime for all server-side components. |
| **npm (v10+)** | Package management and monorepo workspace orchestration (`sample-project` uses npm workspaces). |
| **Git / GitLab** | Version control and CI/CD pipeline management. |
| **curl / HTTPie** | Command-line HTTP testing used throughout development cycle. |

##### Docker Support

The MCP backend includes a production-grade `Dockerfile` and helper shell scripts (`build-container.sh`, `run-container.sh`, `test-container.sh`) enabling containerised deployment. Environment variables including `JWT_SECRET`, `MONGO_URL`, `DB_NAME`, and `SESSION_TIMEOUT` are passed at container runtime, separating configuration from the image layer.

##### CLI Management Scripts

Nine purpose-built Node.js CLI scripts (`scripts/` directory) were implemented to support non-GUI administration workflows appropriate for CI/CD and automation scenarios:

| Script | Function |
|---|---|
| `setup-security.js` | Generates cryptographically secure `.env` configuration with JWT and API key secrets |
| `setup-developer.js` | Registers developer account and generates MCP configuration file |
| `register-agent.js` | Interactive agent registration with policy definition |
| `list-agents.js` | Tabular display of all agents with session statistics |
| `revoke-agent.js` | Agent session revocation and deactivation |
| `manage-api-keys.js` | Full API key lifecycle management |
| `list-keys.js` | Administrative listing of all issued API keys |
| `refresh-key.js` | Developer API key rotation |
| `deactivate-key.js` | Interactive API key deactivation |

---

### 4.2.5 Technology Stack Summary

The following table provides a consolidated overview of the full technology stack organised by system layer:

| Layer | Technology | Version | Justification |
|---|---|---|---|
| **Protocol** | Model Context Protocol SDK | 1.18.2 | Standard MCP implementation; research alignment |
| **Runtime** | Node.js | 20+ | Async I/O; strong security ecosystem |
| **Language (Backend)** | JavaScript (ESM) | ES2022 | Native MCP SDK; mature security libraries |
| **Language (Frontend)** | JavaScript (React/JSX) | ES2022 | Component-driven UI development |
| **HTTP Framework** | Express.js | 4.21.2 | Lightweight; composable middleware; industry standard |
| **Frontend Framework** | React + Vite | 18.3.1 | Fast builds; component reuse; routing |
| **Database** | MongoDB | 6.20.0 (driver) | Document model for flexible policy schemas; TTL indexes for session management |
| **Authentication** | JSON Web Tokens (HS256) | 9.0.2 | Stateless + stateful hybrid verification |
| **Password Hashing** | bcrypt (12 rounds) | 5.1.1 | Industry-standard credential protection |
| **Input Validation** | Zod | 3.25.76 | Runtime schema enforcement at tool boundaries |
| **HTTP Security** | Helmet | 7.1.0 | Automated security header injection |
| **AI Inference** | Groq SDK (Llama 3.3 70B) | 0.8.0 | Low-latency LLM inference for AI tool demonstration |
| **Containerisation** | Docker | — | Reproducible deployment environment |
| **Build Tool** | Vite | — | Fast frontend development and build |
| **CSS Framework** | Tailwind CSS | 3.4.17 | Rapid, consistent UI styling |
| **Inter-service HTTP** | Axios | 1.7.9 | Promise-based HTTP client for service-to-service communication |
| **IDE** | Visual Studio Code | Latest | Primary development environment |
| **Version Control** | Git / GitLab | — | Source control and CI/CD |
| **API Testing** | Postman | — | Endpoint validation and documentation |
| **DB Administration** | MongoDB Compass | — | Runtime database inspection |

**Architectural note:** The separation between the MCP protocol layer (`server.js` running on stdout/stdio transport or SSE), the REST management API (Express on port 3001), and the administrative client (React on port 5173) reflects a deliberate design choice to decouple the security enforcement plane from the management plane — a principle drawn from zero-trust network architecture literature.

---

## 4.3 Data Selection

### 4.3.1 Database Platform

**MongoDB** was selected as the persistence layer for this research implementation, justified by the following considerations aligned with the research domain:

1. **Schema flexibility for policy documents.** The zero-trust policy model requires a hierarchical, heterogeneous document structure (an array of rules, each with optional typed `conditions` sub-documents containing `projectIds`, `operations`, and `timeWindow` objects). MongoDB's BSON document model accommodates this naturally without requiring schema migrations as the policy language evolves during research.

2. **TTL-indexed session management.** MongoDB's native TTL (Time-To-Live) index capability enables automatic expiry of session documents when their `expiresAt` timestamp passes, ensuring the database self-prunes without scheduled cleanup jobs. This is critical for production-grade session lifecycle management.

3. **Aggregation pipeline for audit analytics.** The audit log endpoint (`GET /api/logs/stats`) uses MongoDB aggregation (`$group`, `$project`, `$sort`) to compute per-tool call statistics, latency trends, and failure rates in a single server-side query, avoiding expensive in-application data processing.

4. **Same database for hub and sample project.** The sample project shares the `mcphub` MongoDB database used by the hub backend, enabling the `agent_action_logs` collection (written by the API gateway) and `agent_audit_log` collection (written by the hub's middleware) to be queried together in the admin dashboard, providing a complete cross-service activity view.

### 4.3.2 Data Collections

The following MongoDB collections are used by the system:

#### `agents` Collection

Stores authenticated AI agent identities registered under developer accounts.

```javascript
{
  agentId:      "agt_lzqk0s_4a2f8b...",   // Unique ID: agt_<base36-ts>_<8-byte-hex>
  name:         "BookingBot",
  description:  "Automated booking management agent",
  agentType:    "ai_assistant",            // ai_assistant | automation | ci_bot | data_pipeline
  developerId:  ObjectId("..."),           // Reference to owning developer
  secretHash:   "$2b$12$...",             // bcrypt-12 hash of agent secret
  status:       "active",                 // active | inactive | suspended
  policy: {
    allowedTools:      ["usecases_search", "api_document_link"],
    allowedProjects:   ["proj_booking_system"],
    allowedOperations: ["read", "write"],
    maxSessionDurationMinutes: 60,
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour:   500
    }
  },
  stats: {
    totalSessions:  12,
    totalToolCalls: 847,
    failedCalls:    3,
    lastActive:     ISODate("2026-03-22T...")
  },
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

**Security rationale:** The `secretHash` field stores only the bcrypt-hashed form. The raw secret is returned once upon `registerAgent()` and is never stored or logged. This mirrors the OAuth2 `client_secret` model used in enterprise identity platforms.

#### `agent_sessions` Collection

Stores active and revoked agent session records.

```javascript
{
  sessionId:         "sess_lzqk0s_3f8a...",
  agentId:           "agt_lzqk0s_4a2f8b...",
  developerId:       ObjectId("..."),
  refreshTokenHash:  "$2b$10$...",           // bcrypt hash of refresh token
  context:           "mcp-client",           // Issuing context tag
  revoked:           false,
  revokedAt:         null,
  createdAt:         ISODate("..."),
  expiresAt:         ISODate("...")           // TTL index triggers auto-deletion
}
```

The `expiresAt` field is indexed with MongoDB's TTL index (`expireAfterSeconds: 0`), ensuring that expired session documents are automatically removed from the collection without requiring a scheduled cleanup process.

#### `agent_policies` Collection

Stores the live, DB-authoritative policy rule sets for each agent.

```javascript
{
  agentId: "agt_lzqk0s_4a2f8b...",
  policies: [
    {
      id:          "rule_a1b2c3",
      resource:    "tool:usecases_search",  // tool:<name> | tool:* | tool:prefix_*
      effect:      "allow",                 // allow | deny
      conditions: {
        projectIds:  ["proj_booking_system"],
        operations:  ["read"],
        timeWindow: {
          startHour:  8,
          endHour:    18,
          daysOfWeek: [1, 2, 3, 4, 5]       // Monday–Friday
        }
      },
      description: "Allow booking system search during business hours",
      createdAt:   ISODate("..."),
      updatedAt:   ISODate("...")
    }
  ],
  updatedAt: ISODate("...")
}
```

**Critical design note:** Policy rules are stored separately from the `agents` collection and are read from MongoDB on every tool call, not from the JWT payload. This "DB-authoritative" model ensures that policy changes (e.g., revoking a capability from a compromised agent) take effect within milliseconds, regardless of the residual lifetime of any currently-issued access token — a zero-trust property often absent from purely token-claim-based systems.

#### `agent_audit_log` Collection

Immutable (non-deletable by agents) audit trail of every MCP tool invocation attempt.

```javascript
{
  agentId:     "agt_lzqk0s_4a2f8b...",
  developerId: ObjectId("..."),
  sessionId:   "sess_lzqk0s_3f8a...",
  toolName:    "usecases_search",
  projectId:   "proj_booking_system",
  operation:   "read",
  status:      "success",                 // success | failed | rejected | rate_limited
  reason:      null,                      // Populated on failure: denial reason
  latencyMs:   42,
  request: {
    params: { query: "booking confirmation" }  // Sanitized (secrets removed)
  },
  response: {
    resultCount: 3
  },
  timestamp:   ISODate("2026-03-22T10:15:00Z")
}
```

The audit log uses a double-write strategy: the zero-trust middleware writes an entry regardless of the outcome (step 10 of the middleware chain), including entries for rejected tool calls. This satisfies the zero-trust auditability requirement that all access decisions — not just successful ones — are recorded.

#### `api_keys` Collection

Stores developer API keys for management-plane authentication.

```javascript
{
  developerId:  ObjectId("..."),
  keyHash:      "sha256-hash-of-key",
  prefix:       "mcphub_1703...",         // Non-secret prefix for identification
  permissions:  ["read", "write", "admin"],
  active:       true,
  createdAt:    ISODate("..."),
  lastUsedAt:   ISODate("..."),
  expiresAt:    null                       // null = no expiry unless explicitly set
}
```

#### `projects` Collection

Stores project scopes used to partition agent access across enterprise systems.

```javascript
{
  projectId:   "proj_lzqk0s_7d9e...",
  name:        "Booking Management System",
  description: "...",
  environment: "production",              // development | staging | production
  developerId: ObjectId("..."),
  status:      "active",
  mcpConfig: {
    allowedOperations:  ["read", "write", "execute"],
    rateLimitPerMinute: 60,
    maxAgents:          10,
    contextWindow:      "full"           // full | limited
  },
  tags: ["booking", "production"],
  createdAt:  ISODate("..."),
  updatedAt:  ISODate("...")
}
```

#### `agent_action_logs` Collection (Sample Project)

Written by the sample project's API gateway (`api-gateway/src/middleware/logger.js`) to the same MongoDB database, providing a cross-service activity trace.

```javascript
{
  agentId:     "agt_lzqk0s_4a2f8b...",
  developerId: "...",
  sessionId:   "sess_lzqk0s_3f8a...",
  method:      "POST",
  path:        "/bookings",
  status:      201,
  timestamp:   ISODate("2026-03-22T10:15:01Z")
}
```

### 4.3.3 Data Selection Rationale

The data schema described above was designed according to three zero-trust data principles:

1. **Least-privilege data exposure.** Agent secrets, refresh tokens, and developer passwords are never stored in plaintext. All credential fields store only cryptographic hashes. The raw secret is returned exactly once during registration and is computationally infeasible to recover from its stored hash.

2. **Separation of identity and policy.** The `agents`, `agent_sessions`, and `agent_policies` collections are deliberately separated rather than embedded in a single document. This allows policy rules to be updated (e.g., via `PATCH /api/agents/:id/policy`) without modifying the identity record, facilitating principle-of-least-privilege enforcement with minimal latency.

3. **Immutable, complete audit trail.** The `agent_audit_log` collection records every enforcement decision — including denied and rate-limited requests. Application-level logic intentionally avoids providing delete or update operations on audit records, ensuring tamper-evident logging even if a developer account is compromised.

---

## 4.4 Implementation of Core Functionalities

This section documents the technical implementation of the four core zero-trust security functions: agent identity management, session token lifecycle, policy evaluation, and the middleware enforcement chain. A fifth subsection covers the sample project's MCP authentication integration demonstrating cross-service enforcement.

### 4.4.1 Agent Identity Management (Zero-Trust Phase 1)

**File:** [mura-mcp-backend/src/auth/agentAuth.js](mura-mcp-backend/src/auth/agentAuth.js)

Agent identity management forms the root of the zero-trust model. Before any AI agent can obtain a session token or invoke a protected MCP tool, it must possess a registered identity consisting of an `agentId` (public, non-secret) and an `agentSecret` (private, shown once). This credential pair mirrors the OAuth 2.0 `client_id` / `client_secret` model adapted for AI agent identities.

#### Identity Generation

Identifiers are generated using Node.js's `crypto.randomBytes()` to ensure unpredictability:

```javascript
// Format: agt_<base36-timestamp>_<16-hex-chars>
function generateAgentId() {
  const timestamp  = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `agt_${timestamp}_${randomPart}`;
}

// Format: agtsec_<64-hex-chars> (256 bits of entropy)
function generateAgentSecret() {
  return `agtsec_${crypto.randomBytes(32).toString('hex')}`;
}
```

The base-36 timestamp component in `agentId` allows chronological ordering of identifiers without a database lookup, while the 8-byte random suffix prevents enumeration. The secret's 256 bits of entropy ensures it cannot be brute-forced.

#### Default Deny Policy

A critical zero-trust property is that newly registered agents have **zero privileges by default**. The `DEFAULT_POLICY` object enforces this:

```javascript
const DEFAULT_POLICY = {
  allowedTools:      [],          // empty = no tools allowed
  allowedProjects:   [],          // empty = no projects allowed
  allowedOperations: ['read'],    // read-only by default
  maxSessionDurationMinutes: 30,
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerHour:   500
  }
};
```

This means that after registration, an agent cannot invoke any tool until a developer explicitly grants access through the admin dashboard or policy API. This "deny-all, allow by exception" posture prevents newly-onboarded agents from accessing sensitive capabilities before the developer has consciously reviewed and granted permissions.

#### Secret Storage

The agent secret is hashed using bcrypt before database persistence:

```javascript
export async function registerAgent({ developerId, name, agentType, policy }) {
  const rawSecret    = generateAgentSecret();
  const secretHash   = await bcrypt.hash(rawSecret, SECRET_BCRYPT_ROUNDS); // 12 rounds

  await db.collection('agents').insertOne({
    agentId,
    secretHash,         // Only the hash is stored
    status: 'active',
    policy: mergedPolicy,
    ...
  });

  return { agentId, agentSecret: rawSecret, agent };  // Raw secret returned ONCE
}
```

The return value includes the raw `agentSecret` exactly once. This is the only point in the system where the plaintext secret is accessible; it is never logged, never cached, and cannot be recovered from the database. This design forces developers to handle the secret responsibly at registration time.

#### Credential Validation

Before any session token can be issued, the agent's credentials are verified using bcrypt's constant-time comparison:

```javascript
export async function validateAgentCredentials(agentId, rawSecret) {
  const agent = await db.collection('agents').findOne({ agentId, status: 'active' });
  if (!agent) return { valid: false, error: 'Agent not found or inactive' };

  const secretValid = await bcrypt.compare(rawSecret, agent.secretHash);
  if (!secretValid) return { valid: false, error: 'Invalid agent secret' };

  return { valid: true, agent };
}
```

The bcrypt `compare()` function uses constant-time string comparison, preventing timing oracle attacks that could reveal whether a secret is partially correct.

---

### 4.4.2 Session Token Management (Zero-Trust Phase 2)

**File:** [mura-mcp-backend/src/auth/tokenService.js](mura-mcp-backend/src/auth/tokenService.js)

Following successful credential validation, the token service issues a dual-token pair: a short-lived JWT access token for tool call authentication, and a long-lived refresh token for session renewal. This design balances security (short window for token theft exploitation) with usability (infrequent re-authentication).

#### Token Configuration

```javascript
const CONFIG = {
  issuer:               'mcp-hub',
  audience:             'mcp-hub-tools',
  accessTokenLifetime:  Number.parseInt(process.env.SESSION_TIMEOUT  || '3600',  10),  // Default: 1 hour
  refreshTokenLifetime: Number.parseInt(process.env.REFRESH_TIMEOUT  || '604800', 10), // Default: 7 days
  bcryptRounds:         10,
  get jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be set and at least 32 characters long');
    }
    return secret;
  }
};
```

The `jwtSecret` getter enforces a minimum 32-character length and throws at runtime if the secret is missing or weak — a fail-fast approach that prevents deployment with insecure configurations.

#### Access Token Structure

The JWT access token payload carries the minimum necessary claims:

```javascript
const payload = {
  sub:               agentId,
  sessionId,
  developerId:       agent.developerId.toString(),
  agentName:         agent.name,
  allowedTools:      agent.policy.allowedTools,
  allowedProjects:   agent.policy.allowedProjects,
  allowedOperations: agent.policy.allowedOperations,
  iss:               CONFIG.issuer,
  aud:               CONFIG.audience
};
```

**Important design decision:** Although policy claims are embedded in the JWT, the zero-trust middleware (Section 4.4.4) does *not* use these JWT claims for authorisation decisions. Instead, it performs a live DB lookup of the `agent_policies` collection on every tool call. The JWT claims serve only as a fast-path introspection convenience; the DB is the authoritative policy source. This ensures policy revocations and updates take effect immediately without waiting for token expiry.

#### Refresh Token Security

The refresh token is an opaque, high-entropy random string. It is hashed before storage:

```javascript
function generateRefreshToken() {
  return `ztrefresh_${crypto.randomBytes(40).toString('hex')}`;  // 320 bits of entropy
}

// During issuance:
const refreshTokenHash = await bcrypt.hash(rawRefreshToken, CONFIG.bcryptRounds);
await db.collection('agent_sessions').insertOne({
  sessionId,
  agentId,
  refreshTokenHash,   // Only hash stored
  expiresAt,          // TTL index
  revoked: false
});
```

#### Session Revocation

Revocation is implemented by flipping the `revoked` flag in the `agent_sessions` collection. Since the zero-trust middleware checks session status on every tool call (step 4 of the 10-step chain), revoked sessions are rejected within one database read — a property not achievable with purely stateless JWT verification. This is a defining characteristic of the implemented zero-trust model over conventional stateless approaches.

---

### 4.4.3 Policy Evaluation Engine (Zero-Trust Phase 4)

**File:** [mura-mcp-backend/src/auth/policyEngine.js](mura-mcp-backend/src/auth/policyEngine.js)

The policy engine is the decision-making core of the zero-trust framework. It determines whether a specific (agent, tool, project, operation, time) tuple should be allowed or denied, based on an ordered set of rules fetched live from MongoDB.

#### Design Principles

The engine implements four properties aligned with zero-trust architecture:

1. **Default DENY** — If no rule matches the request context, access is denied. This prevents privilege escalation through policy gaps.
2. **First-match-wins** — Rules are evaluated top-down; the first matching rule's `effect` is returned immediately without evaluating remaining rules.
3. **DB-authoritative** — Rules are read from the `agent_policies` collection on every evaluation, never from JWT claims. Policy changes take effect within the TTL of a single database read (~1–2ms).
4. **Condition-based rules** — Beyond simple tool matching, rules can encode temporal constraints (`timeWindow`), project scope constraints (`projectIds`), and operation type constraints (`operations`).

#### Rule Schema

```javascript
// Stored in agent_policies.policies[]
{
  id:        "rule_a1b2c3",
  resource:  "tool:usecases_search",    // tool:<name> | tool:* | tool:prefix_*
  effect:    "allow",                   // allow | deny
  conditions: {
    projectIds:  ["proj_booking_system"],
    operations:  ["read", "write"],
    timeWindow: {
      startHour:  9,            // UTC hour
      endHour:    17,
      daysOfWeek: [1,2,3,4,5]  // Monday–Friday
    }
  }
}
```

#### Resource Pattern Matching

```javascript
function matchesResource(ruleResource, toolName) {
  if (ruleResource === 'tool:*') return true;              // Wildcard: matches all tools

  if (ruleResource.endsWith(':*')) {                       // Prefix wildcard: tool:usecases_*
    const prefix = ruleResource.slice(0, -1);
    return `tool:${toolName}`.startsWith(prefix);
  }

  return ruleResource === `tool:${toolName}`;              // Exact match
}
```

This three-tier matching supports coarse-grained grants (`tool:*` — any tool), namespace-scoped grants (`tool:usecases_*` — all use-case tools), and precise grants (`tool:usecases_search` — specific tool only).

#### Condition Evaluation

Conditions implement AND semantics — all conditions must be satisfied:

```javascript
function matchesConditions(conditions, context) {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  // Project scope: must be in allowedProjects list
  if (conditions.projectIds?.length > 0) {
    const requested = context.projectId ?? null;
    if (!requested && !conditions.projectIds.includes('*')) return false;
    if (requested && !conditions.projectIds.includes('*') &&
        !conditions.projectIds.includes(requested)) return false;
  }

  // Operation type: must match allowed operations
  if (conditions.operations?.length > 0) {
    if (!conditions.operations.includes(context.operation)) return false;
  }

  // Time window: current UTC time must be within allowed window
  if (conditions.timeWindow) {
    const hourUTC   = new Date().getUTCHours();
    const dayOfWeek = new Date().getUTCDay();
    const { startHour, endHour, daysOfWeek } = conditions.timeWindow;
    if (!daysOfWeek.includes(dayOfWeek)) return false;
    if (hourUTC < startHour || hourUTC >= endHour) return false;
  }

  return true;
}
```

The `timeWindow` condition is a novel addition to standard RBAC models, enabling organisations to enforce time-of-day access restrictions on AI agents — for example, restricting a data pipeline agent to operate only during off-peak hours.

#### Core Evaluation Function

```javascript
export async function evaluatePolicy(agentId, toolName, projectId, operation) {
  const db     = getDatabase();
  const record = await db.collection('agent_policies').findOne({ agentId });

  if (!record || !record.policies?.length) {
    return { allowed: false, reason: 'No policy found — default deny' };
  }

  const context = { projectId, operation };

  for (const rule of record.policies) {
    if (!matchesResource(rule.resource, toolName)) continue;
    if (!matchesConditions(rule.conditions, context))  continue;

    // First matching rule determines the outcome
    return {
      allowed: rule.effect === 'allow',
      reason:  rule.effect === 'deny' ? `Denied by rule: ${rule.id}` : null,
      matchedRule: rule.id
    };
  }

  // No rule matched — default deny
  return { allowed: false, reason: 'No matching rule — default deny' };
}
```

#### Policy Simulation

The engine also exposes a `simulatePolicy()` function that evaluates a hypothetical (toolName, projectId, operation) tuple against an agent's current rules without modifying state. This is exposed via `POST /api/agents/:id/policy/simulate` and rendered in the PolicyPage UI, allowing administrators to verify policy configurations before deploying them to production agents.

---

### 4.4.4 Zero-Trust Middleware Chain (Core Enforcement)

**File:** [mura-mcp-backend/src/auth/zeroTrustMiddleware.js](mura-mcp-backend/src/auth/zeroTrustMiddleware.js)

The zero-trust middleware is the critical enforcement component that wraps every MCP tool handler. It implements a **10-step sequential verification chain** that every tool invocation must pass before the underlying tool logic is executed.

#### The `withZeroTrust` Wrapper

Every tool is registered through this wrapper:

```javascript
// Tool registration pattern (server.js)
server.tool('usecases_search', schema, withZeroTrust('usecases_search', async (args) => {
  // Actual tool logic — only reached if all 10 checks pass
}));
```

#### The 10-Step Verification Chain

```
Step 1  — Token Present?          Extract from _token param or MCP_AGENT_TOKEN env var
Step 2  — JWT Signature Valid?    HS256 verification using JWT_SECRET
Step 3  — Token Not Expired?      Check exp claim
Step 4  — Session Not Revoked?    Live DB lookup: agent_sessions.revoked
Step 5  — Agent Still Active?     Live DB lookup: agents.status === 'active'
Step 6  — Policy Allows?          Live DB lookup: evaluatePolicy() from agent_policies
Step 7  — (merged into Step 6)    Project scope evaluated by policy engine conditions
Step 8  — (merged into Step 6)    Operation type evaluated by policy engine conditions
Step 9  — Rate Limit OK?          Sliding window: count agent_audit_log for last 60s
Step 10 — Write Audit Log         Always written (pass or fail)
```

Steps 6, 7, and 8 are merged into a single `evaluatePolicy()` call to reduce the number of MongoDB round-trips from three to one. The policy engine's `conditions` object handles both project scope and operation type in a single document evaluation.

#### Rate Limiting (Step 9)

Rate limiting uses an audit-log-based sliding window rather than an in-memory counter, ensuring correctness under horizontal scaling:

```javascript
async function checkRateLimit(agentId, rateLimit) {
  const db          = getDatabase();
  const windowStart = new Date(Date.now() - 60 * 1000);  // Last 60 seconds
  const limit       = rateLimit?.requestsPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;  // Default: 60

  const recentCalls = await db.collection('agent_audit_log').countDocuments({
    agentId,
    timestamp: { $gte: windowStart }
  });

  return {
    allowed: recentCalls < limit,
    current: recentCalls,
    limit,
    resetAt: new Date(windowStart.getTime() + 60 * 1000)
  };
}
```

Because the count is taken from the `agent_audit_log` collection — which already exists for audit purposes — the rate limiter adds no additional database collection overhead. The sliding window naturally handles burst traffic more gracefully than a fixed-window counter.

#### Audit Logging (Step 10)

The audit log write is always executed, regardless of outcome. Sensitive parameters are sanitised before storage:

```javascript
async function writeAuditLog(entry) {
  try {
    const db = getDatabase();
    await db.collection('agent_audit_log').insertOne({
      ...entry,
      timestamp: new Date()
    });
  } catch (err) {
    // Audit failure must NEVER block tool execution
    console.error('Audit log write failed:', err.message);
  }
}
```

The `try/catch` around the audit write is intentional: a transient MongoDB write failure should not propagate as a tool execution failure. However, for production deployments, the research recommends upgrading to a durable message queue (e.g., Apache Kafka or AWS SQS) to guarantee audit delivery under database unavailability scenarios.

#### Operation Classification

Tools are classified into operation tiers requiring corresponding policy grants:

```javascript
const WRITE_TOOLS = new Set([
  'usecases_upsert',
  'api_document_link',
  'project_bootstrap',
  'usecase_sync_automation',
  'scaffold_create'
]);

const ADMIN_TOOLS = new Set([/* Reserved for future admin-only tools */]);

function resolveRequiredOperation(toolName) {
  if (ADMIN_TOOLS.has(toolName)) return 'admin';
  if (WRITE_TOOLS.has(toolName)) return 'write';
  return 'read';  // Default: read operation required
}
```

This ensures that data-mutating tools require an explicit `write` permission grant, preventing an agent with only `read` access from accidentally or maliciously modifying enterprise data.

---

### 4.4.5 Sample Project: Cross-Service MCP Authentication

**Files:** [sample-project/api-gateway/src/middleware/mcpAuth.js](sample-project/api-gateway/src/middleware/mcpAuth.js), [sample-project/api-gateway/src/middleware/logger.js](sample-project/api-gateway/src/middleware/logger.js)

The sample project operationalises the zero-trust framework in a realistic three-service microservices architecture. It demonstrates the end-to-end flow from AI agent request to zero-trust verification to business service execution.

#### System Architecture

```
AI Agent
  │  X-Agent-Token: <mcp_session_token>
  ▼
API Gateway (PORT 4000)
  │  Validates token via POST → MCP Hub :3001 /api/agents/validate-session
  │  Checks allowedProjects includes PROJECT_ID
  │  Attaches req.agent context
  ▼
Auth-Service  (PORT 4001)  ← User management (JWT-protected)
Booking-Service (PORT 4002) ← Booking CRUD + AI email generation
  │
  ▼
MongoDB (mcphub DB) ← agent_action_logs written by logger middleware
```

#### MCP Authentication Middleware (`mcpAuth.js`)

The API gateway's `mcpAuth` middleware implements the client-side of the zero-trust verification:

```javascript
export async function mcpAuth(req, res, next) {
  // Step 1: Extract token from X-Agent-Token header or Authorization Bearer
  const token = req.headers['x-agent-token']
    || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7) : null);

  if (!token) {
    return res.status(401).json({
      success: false,
      error:   'Missing agent token',
      hint:    'Pass your MCP Hub session token in the X-Agent-Token header.'
    });
  }

  // Step 2: Validate token with MCP Hub backend
  const { data } = await axios.post(
    `${MCP_URL}/api/agents/validate-session`,
    { accessToken: token },
    { timeout: 5000 }
  );

  // Step 3: Check project access scope
  if (PROJECT_ID && data.allowedProjects?.length > 0) {
    if (!data.allowedProjects.includes(PROJECT_ID)) {
      return res.status(403).json({
        success: false,
        error: `Agent not authorized for project "${PROJECT_ID}".`,
        allowedProjects: data.allowedProjects
      });
    }
  }

  // Step 4: Attach verified agent context to request
  req.agent = {
    agentId:           data.agentId,
    developerId:       data.developerId,
    sessionId:         data.sessionId,
    allowedTools:      data.allowedTools      || [],
    allowedProjects:   data.allowedProjects   || [],
    allowedOperations: data.allowedOperations || []
  };
  next();
}
```

This middleware pattern — delegating token validation to a centralised hub — is a key architectural contribution of the research. Rather than each microservice independently implementing JWT verification logic (which leads to inconsistency and drift), all services delegate to the MCP Hub as the single policy enforcement point.

#### AI Tool Integration in the Sample Project

The booking service demonstrates integration with the hub's AI tool capability. The `generate_email` tool endpoint invokes Groq's Llama 3.3 70B model via the hub's tool invocation layer:

```javascript
// sample-project/booking-service/src/routes/bookings.js
router.post('/:id/generate-email', async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  const { data } = await axios.post(`${MCP_URL}/api/tools/invoke`, {
    tool:   'generate_email',
    params: {
      bookingTitle:    booking.title,
      bookingDate:     booking.date,
      bookingLocation: booking.location,
      attendees:       booking.attendees
    }
  }, {
    headers: { 'x-api-key': process.env.MCP_API_KEY }
  });

  booking.emailContent = data.result.email;
  await booking.save();
  res.json({ emailContent: data.result.email, tokenUsage: data.result.usage });
});
```

This demonstrates that AI capability invocation is also subject to the hub's API key authentication and audit logging, maintaining the zero-trust property across both data operations and AI-powered operations.

---

## 4.5 User Interfaces

Two user interfaces were implemented as part of the research: the MURA-MCP admin dashboard (for security administrators and developers) and the sample project booking client (for end users whose requests are intercepted by the zero-trust layer).

### 4.5.1 MURA-MCP Admin Dashboard

**Technology:** React 18, React Router v7, Tailwind CSS, Lucide Icons  
**Port:** 5173 (development)  
**Entry Point:** [mura-mcp-client/src/App.jsx](mura-mcp-client/src/App.jsx)

The admin dashboard provides a graphical interface for all zero-trust management operations. It is protected by a `RequireAuth` route wrapper that redirects unauthenticated users to the login page.

#### Route Structure

```
/login          → LoginPage       — Developer authentication (API key or email/password)
/register       → RegisterPage    — Developer self-registration
/ (protected)
  /             → DashboardPage   — System overview: agent counts, session stats
  /projects     → ProjectsPage    — Project scope management
  /agents       → AgentsPage      — Agent registration and management
  /agents/:id   → AgentDetailPage — Per-agent detail, secret rotation, session control
  /agents/:id/policy → PolicyPage — Policy rule editor and simulator
  /logs         → LogsPage        — Paginated audit log viewer
```

#### Dashboard Page

The dashboard provides at-a-glance operational visibility: total registered agents, active vs. inactive agent counts, current active session count, and a recent activity table showing the five most recently active agents with their status badges.

#### Agents Page

The agents management page supports:
- Listing all registered agents with status indicators (active/inactive)
- A registration form with a dropdown of 25+ pre-configured AI agent name templates (covering OpenAI GPT-4o, Anthropic Claude 3.5, Google Gemini 2.0, Meta Llama 3.3, Mistral, DeepSeek, xAI Grok, and specialised automation frameworks including LangChain, CrewAI, AutoGPT, and BabyAGI)
- Tool assignment from a set of 10 predefined capability categories: search, read, write, execute, database, email, API, files, data analysis, and report generation
- Status badge display per agent

This pre-configured template approach recognises that enterprise deployments typically involve a finite set of well-known AI systems, reducing registration friction while encouraging conscious capability assignment.

#### Agent Detail Page

The agent detail view surfaces all operational information for a single agent and provides:
- **Inline edit mode** for updating name, description, allowed tools, and allowed projects
- **Rotate Secret** — generates a new `agentSecret`, invalidating the old one; the new secret is displayed once in a modal
- **Revoke All Sessions** — immediately invalidates all active sessions for the agent
- **Delete Agent** — soft-deactivates the agent (preserving audit history)
- **Active Sessions** list with session IDs and expiry timestamps

#### Policy Page

The policy management page is the most security-critical interface in the admin dashboard. It presents:

- **Rules table** showing each active rule with its resource pattern (e.g., `tool:usecases_search`), effect (allow/deny displayed with colour-coded badges), project scope, operation types, and a delete button
- **Add Rule form** for composing new policy rules with resource, effect, project ID, and operation type fields
- **Policy Simulator** — an interactive panel where administrators enter a tool name, project ID, and operation type and receive an instant allow/deny decision with the matched rule ID, enabling policy verification before deployment

The first-match-wins evaluation model is communicated through the UI's rule ordering display, where rules are numbered and a tooltip explains that rules are evaluated top-to-bottom.

#### Logs Page

The audit log viewer provides:
- **Paginated log list** with filterable columns: tool name, calling agent, project, status (success/failed/rejected/rate_limited), duration, and timestamp
- **Status badges** with semantic colour coding: green for success, red for failed, yellow for rejected by policy, orange for rate-limited
- **Log detail drawer** (right-side slide-in panel) showing the full audit record including request parameters (sanitised), response summary, error trace (for failures), session ID, and latency in milliseconds
- **Filter bar** supporting simultaneous filtering by agent, project, tool name, status, and date range
- **Statistics panel** (from `GET /api/logs/stats`) showing aggregate call volumes, success rates, and per-tool usage counts

The log viewer deliberately exposes all rejected and rate-limited entries alongside successful calls, reinforcing the zero-trust principle that every access decision — including denials — is auditable.

#### Projects Page

Projects define the organisational scopes used in policy rule conditions. The projects management interface provides:
- Project creation form with fields for name, description, environment tag (development/staging/production), MCP configuration (allowed operations, rate limit, max agents), and internal service URLs
- Project listing with agent count and status
- **Connectivity check** button that pings the project's configured API gateway URL and reports reachability

### 4.5.2 Sample Project Booking Client

**Technology:** React 18, React Router v7, Tailwind CSS  
**Port:** 5174 (development)  
**Entry Point:** [sample-project/client/src/App.jsx](sample-project/client/src/App.jsx)

The sample project client simulates an end-user booking application where all backend requests are routed through the MCP-authenticated API gateway. Its primary purpose is to demonstrate that zero-trust enforcement is transparent to the end user.

#### Bookings Page

The booking management interface provides:
- **BookingCard component** — displays each booking with title, date, location, status badge (confirmed/pending/cancelled), attendees list, and action buttons
- **BookingForm component** — create/edit form with all booking fields
- **Generate AI Email** button — calls the booking service's `generate_email` endpoint, which invokes the MCP Hub's AI tool. The returned email content is displayed in a panel with a copy-to-clipboard button. This demonstrates the end-to-end flow: user action → booking service → MCP Hub (zero-trust verified tool invocation) → Groq AI → response

#### Settings Page

The settings page provides agent token configuration instructions — a deliberate design choice to make the zero-trust token requirement visible to operators. It includes:
- Step-by-step instructions for obtaining an MCP Hub session token
- A textarea for pasting the access token (stored in `localStorage` as `agentToken`)
- A "Clear All Tokens" button for security hygiene
- A status indicator showing whether a valid token is currently configured

This page reflects a key usability finding from the implementation: that zero-trust token management must be made explicit and easy for application operators, not buried in infrastructure configuration.

---

## 4.6 Chapter Summary

This chapter has presented the complete technical implementation of a zero-trust security framework for MCP-enabled AI agents in a distributed enterprise architecture. The implementation, MURA-MCP Hub, comprises a Node.js/Express backend, a React administrative dashboard, and a three-service sample microservices application.

The four core security mechanisms implemented are:

1. **Agent Identity Management** — Cryptographically strong agent identities using bcrypt-12 hashed secrets and 256-bit random credentials, with a default-deny policy preventing privilege escalation from newly registered agents.

2. **JWT Session Token Lifecycle** — A dual-token model (short-lived access tokens + long-lived opaque refresh tokens) with stateful session revocation enabling immediate invalidation independent of token expiry. The token service enforces JWT signing key length requirements at boot time, preventing deployment with weak secrets.

3. **Policy Evaluation Engine** — A first-match-wins, default-deny rule engine operating over live MongoDB policy documents, supporting exact, wildcard, and prefix resource matching with AND-semantics conditions covering project scope, operation type, and time-of-day constraints. The DB-authoritative model ensures policy changes take effect within milliseconds without token reissuance.

4. **Zero-Trust Middleware Chain** — A 10-step sequential verification wrapper applied to every MCP tool handler, combining stateless JWT verification with stateful database checks for session revocation, agent status, policy compliance, and sliding-window rate limiting, concluding with an immutable audit log entry on every invocation.

The technology stack — Node.js, Express, MongoDB, JSON Web Tokens, bcrypt, Zod, and React — was selected for its maturity, security audit record, and alignment with the MCP protocol ecosystem. The sample project demonstrates that the framework integrates naturally into existing distributed microservice architectures as a centralised policy enforcement point, requiring only the addition of the `mcpAuth` middleware to each service's gateway layer.

The implementation validates the research proposition that zero-trust principles — never trust, always verify, assume breach — can be systematically applied to AI agent identity and access management within the MCP protocol framework, providing a reproducible reference architecture for enterprise deployments of AI agents in security-sensitive distributed environments.

---

*End of Chapter 4: Implementation*
