// ============================================================
// mcpAuth.js — MCP Hub token validation middleware
//
// Every request to the API Gateway must carry a valid MCP Hub
// agent session token in the X-Agent-Token header.
// This middleware:
//   1. Extracts the token
//   2. Calls POST /api/agents/validate-session on the MCP backend
//   3. Checks the agent's allowedProjects includes PROJECT_ID
//   4. Attaches agent context to req.agent
//   5. Rejects with 401/403 if not valid
// ============================================================

import axios from 'axios'

const MCP_URL    = process.env.MCP_URL    || 'http://localhost:3001'
const PROJECT_ID = process.env.PROJECT_ID || ''

/**
 * Fire-and-forget: log a denied gateway access to the MCP backend.
 */
async function logDeniedAccess(agentData, req, denyReason, statusCode) {
  try {
    await axios.post(
      `${MCP_URL}/api/agents/log-access`,
      {
        agentId:     agentData?.agentId     ?? 'unknown',
        sessionId:   agentData?.sessionId   ?? 'unknown',
        developerId: agentData?.developerId ?? 'unknown',
        action:      'GATEWAY_ACCESS',
        resource:    req.headers['x-target-service'] || req.path.split('/').filter(Boolean)[0] || 'unknown',
        method:      req.method,
        path:        req.originalUrl,
        projectId:   PROJECT_ID || null,
        allowed:     false,
        denyReason,
        statusCode,
        ip:          req.ip
      },
      { timeout: 3000 }
    )
  } catch {
    // Non-critical — never fail the response due to logging errors
  }
}

export async function mcpAuth(req, res, next) {
  // Agent token MUST come from X-Agent-Token header only.
  // Authorization: Bearer is reserved exclusively for the user JWT — never treat it as an agent token.
  const token = req.headers['x-agent-token'] || null

  if (!token) {
    return res.status(401).json({
      success: false,
      error:   'Missing agent token',
      hint:    'Pass your MCP Hub session token in the X-Agent-Token header.'
    })
  }

  try {
    const { data } = await axios.post(
      `${MCP_URL}/api/agents/validate-session`,
      { accessToken: token },
      {
        headers: {
          'Content-Type':    'application/json',
          'x-target-service': req.targetService || 'api-gateway',
          'x-target-method':  req.method,
          'x-target-path':    req.originalUrl,
          'x-project-id':     PROJECT_ID
        },
        timeout: 5000
      }
    )

    if (!data.active) {
      return res.status(401).json({
        success: false,
        error:   'Agent token is expired or revoked.'
      })
    }

    // Project access check
    if (PROJECT_ID && data.allowedProjects?.length > 0) {
      if (!data.allowedProjects.includes(PROJECT_ID)) {
        logDeniedAccess(data, req, `project_not_allowed:${PROJECT_ID}`, 403)
        return res.status(403).json({
          success:   false,
          error:     `Agent is not authorized for project "${PROJECT_ID}".`,
          agentId:   data.agentId,
          allowedProjects: data.allowedProjects
        })
      }
    }

    // ── Operation enforcement ──────────────────────────────────
    // Mutations (POST/PUT/PATCH/DELETE) require 'write' or 'admin' in allowedOperations.
    const ops            = data.allowedOperations || []
    const isMutation     = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())
    const requiredOp     = isMutation ? 'write' : 'read'
    const operationDenied = ops.length > 0
      && !ops.includes(requiredOp)
      && !ops.includes('admin')

    if (operationDenied) {
      logDeniedAccess(data, req, `operation_not_allowed:${requiredOp}`, 403)
      return res.status(403).json({
        success:           false,
        error:             `Agent is not authorized for '${requiredOp}' operations on this service.`,
        allowedOperations: ops,
        agentId:           data.agentId
      })
    }

    // ── Service enforcement ────────────────────────────────────
    // Maps ANY path segment to a logical service name.
    // Scans all segments so nested routes like /travellers/:id/payments
    // are correctly identified as touching the 'payment' service too.
    const SERVICE_MAP = {
      'bookings':   'booking',
      'travellers': 'traveller',
      'payments':   'payment',
      'auth':       'auth',
    }
    const allowedSvcs = data.allowedServices || []
    if (allowedSvcs.length > 0) {
      const segments = req.path.split('/').filter(Boolean)
      for (const seg of segments) {
        const service = SERVICE_MAP[seg]
        if (service && !allowedSvcs.includes(service)) {
          logDeniedAccess(data, req, `service_not_allowed:${service}`, 403)
          return res.status(403).json({
            success:         false,
            error:           `Agent is not authorized to access the '${service}' service.`,
            allowedServices: allowedSvcs,
            agentId:         data.agentId
          })
        }
      }
    }

    // Attach agent context
    req.agent = {
      agentId:           data.agentId,
      developerId:       data.developerId,
      sessionId:         data.sessionId,
      allowedTools:      data.allowedTools      || [],
      allowedProjects:   data.allowedProjects   || [],
      allowedOperations: ops,
      allowedServices:   data.allowedServices   || [],
      expiresAt:         data.expiresAt
    }

    next()

  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      return res.status(err.response.status).json({
        success: false,
        error:   err.response.data?.error || 'Authorization failed'
      })
    }
    console.error('[mcpAuth] MCP validation error:', err.message)
    return res.status(502).json({
      success: false,
      error:   'Could not reach MCP Hub backend. Is it running on port 3001?'
    })
  }
}
