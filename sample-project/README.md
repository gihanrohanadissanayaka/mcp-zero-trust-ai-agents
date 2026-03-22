# MCP Hub — Sample Project

A three-service Express monorepo demonstrating **MCP Hub access control** for AI agents.

```
sample-project/
├── api-gateway/      PORT 4000  — entry point for all agent requests
├── auth-service/     PORT 4001  — user registration & login
└── booking-service/  PORT 4002  — booking CRUD
```

## How It Works

```
AI Agent
  │  X-Agent-Token: <mcphub session token>
  ▼
API Gateway (4000)
  │  POST http://localhost:3001/api/agents/validate-session
  ▼
MCP Hub Backend (3001) ← checks token, returns allowedProjects
  │  ✓ allowed?
  ▼
Auth-Service (4001)  or  Booking-Service (4002)
  │
  ▼
MongoDB (mcphub DB) ← agent_action_logs written
```

## Quick Start

### 1. Register an agent in the MCP Hub client UI

- Go to `http://localhost:5173/agents` → Register
- Choose a name (e.g. *BookingBot*)
- Add allowed projects: select the project you created
- Save and copy the `agentId` + `agentSecret`

### 2. Get a session token

```bash
curl -X POST http://localhost:3001/api/agents/authenticate \
  -H "Content-Type: application/json" \
  -d '{ "agentId": "YOUR_AGENT_ID", "agentSecret": "YOUR_AGENT_SECRET" }'
```

Copy the `accessToken` from the response.

### 3. Install & run the sample project

```bash
cd sample-project
npm install
npm run dev
```

### 4. Call the API Gateway as an agent

```bash
# List bookings (via gateway → booking-service)
curl http://localhost:4000/bookings \
  -H "X-Agent-Token: YOUR_ACCESS_TOKEN"

# Create a booking
curl -X POST http://localhost:4000/bookings \
  -H "X-Agent-Token: YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Team Meeting", "date": "2026-04-01", "attendees": ["alice","bob"] }'

# Register a user (via gateway → auth-service)
curl -X POST http://localhost:4000/auth/register \
  -H "X-Agent-Token: YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "email": "user@example.com", "password": "test1234", "name": "Alice" }'
```

If the agent's `allowedProjects` does not include the configured `PROJECT_ID`, the gateway returns **403 Forbidden**.

## Environment Variables

Copy `.env.example` to each service directory and configure:

| Variable | Default | Description |
|---|---|---|
| `MCP_URL` | `http://localhost:3001` | MCP Hub backend URL |
| `PROJECT_ID` | *(set in .env)* | The project ID this sample represents |
| `GATEWAY_PORT` | `4000` | API Gateway port |
| `AUTH_SERVICE_URL` | `http://localhost:4001` | Internal auth-service URL |
| `BOOKING_SERVICE_URL` | `http://localhost:4002` | Internal booking-service URL |
| `MONGO_URI` | `mongodb://localhost:27017/mcphub` | Same MongoDB as MCP Hub |

## Checking Action Logs

All validated agent requests are logged to the `agent_action_logs` MongoDB collection.
Use the MCP Hub client or query MongoDB directly:

```js
db.agent_action_logs.find().sort({ timestamp: -1 }).limit(20)
```
