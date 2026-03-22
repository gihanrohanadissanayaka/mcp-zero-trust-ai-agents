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

export async function mcpAuth(req, res, next) {
  const token = req.headers['x-agent-token']
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null)

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
        return res.status(403).json({
          success:   false,
          error:     `Agent is not authorized for project "${PROJECT_ID}".`,
          agentId:   data.agentId,
          allowedProjects: data.allowedProjects
        })
      }
    }

    // Attach agent context
    req.agent = {
      agentId:           data.agentId,
      developerId:       data.developerId,
      sessionId:         data.sessionId,
      allowedTools:      data.allowedTools      || [],
      allowedProjects:   data.allowedProjects   || [],
      allowedOperations: data.allowedOperations || [],
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
