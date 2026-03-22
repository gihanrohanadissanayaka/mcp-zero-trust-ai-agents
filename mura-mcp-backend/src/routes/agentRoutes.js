#!/usr/bin/env node

// ============================================================
// Agent Management REST Routes
// Zero Trust MCP — Phase 1
//
// All routes under /api/agents/*
// Developer must authenticate via their existing API key
// (Bearer <mcphub_api_key>) to manage their agents.
// ============================================================

import express from 'express';
import {
  registerAgent,
  getAgentById,
  getAgentsByDeveloper,
  updateAgentPolicy,
  deactivateAgent,
  rotateAgentSecret
} from '../auth/agentAuth.js';
import {
  issueSessionToken,
  refreshSession,
  revokeSession,
  introspectToken
} from '../auth/tokenService.js';
import {
  getPolicyDocument,
  addPolicyRule,
  removePolicyRule,
  replacePolicyRules,
  simulatePolicy
} from '../auth/policyEngine.js';
import { getDatabase } from '../config/database/connection.js';

const router = express.Router();

// ============================================================
// MIDDLEWARE — Authenticate the developer making the request
// Reuses the existing api_keys collection (dev API key as Bearer)
// ============================================================

async function requireDeveloperAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error:   'Authorization header with Bearer token required',
      hint:    'Use your developer API key: Authorization: Bearer mcphub_...'
    });
  }

  const apiKey = authHeader.substring(7);

  try {
    const db           = getDatabase();
    const apiKeyRecord = await db.collection('api_keys').findOne({
      key:    apiKey,
      active: true
    });

    if (!apiKeyRecord) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or inactive API key'
      });
    }

    // Attach developer context to request
    req.developer = {
      developerId: apiKeyRecord.developerId.toString(),
      email:       apiKeyRecord.email,
      name:        apiKeyRecord.name
    };

    // Update last used
    await db.collection('api_keys').updateOne(
      { key: apiKey },
      { $set: { lastUsed: new Date() } }
    );

    next();
  } catch (error) {
    console.error('Developer auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication service error'
    });
  }
}

// ============================================================
// POST /api/agents/authenticate
// Agent exchanges agentId + agentSecret for a JWT session token.
// This is the Zero Trust entry point for every AI agent session.
// ============================================================

router.post('/authenticate', async (req, res) => {
  try {
    const { agentId, agentSecret, context } = req.body;

    if (!agentId || !agentSecret) {
      return res.status(400).json({
        success: false,
        error:   'agentId and agentSecret are required'
      });
    }

    const result = await issueSessionToken(
      agentId.trim(),
      agentSecret.trim(),
      context?.trim() || 'mcp-client'
    );

    res.status(200).json({
      success:      true,
      message:      'Authentication successful. Include the accessToken as Bearer in MCP tool calls.',
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
      sessionId:    result.sessionId,
      tokenType:    result.tokenType,
      expiresIn:    result.expiresIn,
      expiresAt:    result.expiresAt,
      agent:        result.agent
    });

  } catch (error) {
    console.error('Agent authentication error:', error.message);
    // Use 401 for auth failures, not 500
    const status = (
      error.message.includes('not found') ||
      error.message.includes('Invalid') ||
      error.message.includes('inactive')
    ) ? 401 : 500;

    res.status(status).json({
      success: false,
      error:   error.message
    });
  }
});

// ============================================================
// POST /api/agents/validate-session
// Public endpoint — called by external services (e.g. API Gateway)
// to validate an agent access token without developer auth.
// Returns agent identity, allowedTools, allowedProjects.
// ============================================================

router.post('/validate-session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const bodyToken  = req.body?.accessToken;
    const token      = bodyToken || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);

    if (!token) {
      return res.status(400).json({
        success: false,
        error:   'accessToken required in body or Authorization header'
      });
    }

    const result = await introspectToken(token);

    if (!result.active) {
      return res.status(401).json({
        success: false,
        active:  false,
        error:   result.revoked ? 'Token has been revoked' : 'Token is expired or invalid'
      });
    }

    // Log the validation call
    const db = getDatabase();
    await db.collection('agent_action_logs').insertOne({
      logId:      `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      agentId:    result.agentId,
      developerId: result.developerId,
      sessionId:  result.sessionId,
      action:     'VALIDATE_SESSION',
      resource:   req.headers['x-target-service'] || 'unknown',
      method:     req.headers['x-target-method']  || 'unknown',
      path:       req.headers['x-target-path']    || 'unknown',
      projectId:  req.headers['x-project-id']     || null,
      allowed:    true,
      ip:         req.ip,
      timestamp:  new Date()
    });

    return res.status(200).json({
      success:           true,
      active:            true,
      agentId:           result.agentId,
      developerId:       result.developerId,
      sessionId:         result.sessionId,
      allowedTools:      result.allowedTools      || [],
      allowedProjects:   result.allowedProjects   || [],
      allowedOperations: result.allowedOperations || [],
      expiresAt:         result.expiresAt
    });

  } catch (error) {
    console.error('Validate-session error:', error.message);
    res.status(500).json({ success: false, error: 'Validation service error' });
  }
});

// ============================================================
// POST /api/agents/refresh
// Exchange a valid refresh token for a new access token.
// Old refresh token is rotated (invalidated) on each use.
// ============================================================

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error:   'refreshToken is required'
      });
    }

    const result = await refreshSession(refreshToken.trim());

    res.status(200).json({
      success:      true,
      message:      'Token refreshed. Use the new accessToken and store the new refreshToken.',
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,   // new rotated refresh token
      sessionId:    result.sessionId,
      tokenType:    result.tokenType,
      expiresIn:    result.expiresIn,
      expiresAt:    result.expiresAt,
      agent:        result.agent
    });

  } catch (error) {
    console.error('Token refresh error:', error.message);
    const status = error.message.includes('expired') || error.message.includes('Invalid') ? 401 : 500;
    res.status(status).json({
      success: false,
      error:   error.message
    });
  }
});

// ============================================================
// POST /api/agents/revoke-session
// Revoke a specific session by its sessionId.
// Agent can revoke its own session (logout), dev can revoke any.
// ============================================================

router.post('/revoke-session', async (req, res) => {
  try {
    const { sessionId, reason } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error:   'sessionId is required'
      });
    }

    const result = await revokeSession(sessionId.trim(), reason || 'client_logout');

    res.status(200).json({
      success: true,
      message: `Session ${result.sessionId} revoked.`,
      data:    result
    });

  } catch (error) {
    console.error('Revoke session error:', error.message);
    res.status(400).json({
      success: false,
      error:   error.message
    });
  }
});

// ============================================================
// POST /api/agents/introspect
// Inspect a token's claims and revocation status.
// Requires developer auth — not exposed to agents themselves.
// ============================================================

router.post('/introspect', requireDeveloperAuth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error:   'token is required'
      });
    }

    const info = await introspectToken(token.trim());

    res.status(200).json({
      success: true,
      data:    info
    });

  } catch (error) {
    console.error('Introspect error:', error.message);
    res.status(500).json({
      success: false,
      error:   error.message
    });
  }
});

// ============================================================
// POST /api/agents/register
// Register a new AI agent under the authenticated developer account
// ============================================================

router.post('/register', requireDeveloperAuth, async (req, res) => {
  try {
    const { name, description, agentType, policy } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Agent name is required'
      });
    }

    // Validate agentType if provided
    const validAgentTypes = ['ai_assistant', 'automation', 'ci_bot', 'data_pipeline', 'custom'];
    if (agentType && !validAgentTypes.includes(agentType)) {
      return res.status(400).json({
        success: false,
        error:  `Invalid agentType. Allowed values: ${validAgentTypes.join(', ')}`
      });
    }

    // Validate policy fields if provided
    if (policy) {
      if (policy.allowedOperations) {
        const validOps = ['read', 'write', 'admin'];
        const invalidOps = policy.allowedOperations.filter(op => !validOps.includes(op));
        if (invalidOps.length > 0) {
          return res.status(400).json({
            success: false,
            error: `Invalid operations: ${invalidOps.join(', ')}. Allowed: ${validOps.join(', ')}`
          });
        }
      }

      if (policy.maxSessionDurationMinutes !== undefined) {
        if (
          typeof policy.maxSessionDurationMinutes !== 'number' ||
          policy.maxSessionDurationMinutes < 1 ||
          policy.maxSessionDurationMinutes > 480   // max 8 hours
        ) {
          return res.status(400).json({
            success: false,
            error: 'maxSessionDurationMinutes must be a number between 1 and 480'
          });
        }
      }
    }

    const result = await registerAgent({
      developerId: req.developer.developerId,
      name:        name.trim(),
      description: description?.trim() || '',
      agentType:   agentType || 'ai_assistant',
      policy:      policy   || {}
    });

    // IMPORTANT: agentSecret is only returned here — never again
    res.status(201).json({
      success: true,
      message: 'Agent registered successfully. Store the agentSecret securely — it will not be shown again.',
      data: {
        agentId:     result.agentId,
        agentSecret: result.agentSecret,   // ONE-TIME display
        agent:       result.agent
      }
    });

  } catch (error) {
    console.error('Agent registration error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// GET /api/agents
// List all agents for the authenticated developer
// ============================================================

router.get('/', requireDeveloperAuth, async (req, res) => {
  try {
    const agents = await getAgentsByDeveloper(req.developer.developerId);

    res.json({
      success: true,
      data: {
        total:      agents.length,
        agents:     agents.map(a => ({
          agentId:     a.agentId,
          name:        a.name,
          description: a.description,
          agentType:   a.agentType,
          active:      a.active,
          policy: {
            allowedTools:      a.policy?.allowedTools      || [],
            allowedProjects:   a.policy?.allowedProjects   || [],
            allowedOperations: a.policy?.allowedOperations || ['read'],
            maxSessionDurationMinutes: a.policy?.maxSessionDurationMinutes || 30
          },
          stats:       a.stats,
          createdAt:   a.createdAt,
          lastAuthAt:  a.lastAuthAt,
          lastUsedAt:  a.lastUsedAt
        }))
      }
    });

  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// GET /api/agents/:agentId
// Get a specific agent's details (developer must own it)
// ============================================================

router.get('/:agentId', requireDeveloperAuth, async (req, res) => {
  try {
    const agent = await getAgentById(req.params.agentId);

    // Verify ownership
    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied — this agent belongs to a different developer'
      });
    }

    // Get active session count
    const db             = getDatabase();
    const activeSessions = await db.collection('agent_sessions').countDocuments({
      agentId: req.params.agentId,
      revoked: false,
      expiresAt: { $gt: new Date() }
    });

    res.json({
      success: true,
      data: {
        ...agent,
        activeSessions
      }
    });

  } catch (error) {
    console.error('Get agent error:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// PATCH /api/agents/:agentId
// Update agent name, description, allowedTools, allowedProjects
// ============================================================

router.patch('/:agentId', requireDeveloperAuth, async (req, res) => {
  try {
    const db    = getDatabase();
    const agent = await getAgentById(req.params.agentId);

    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { name, description, allowedTools, allowedProjects } = req.body;
    const updates = { updatedAt: new Date() };

    if (name        !== undefined) updates.name        = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (Array.isArray(allowedTools))    updates['policy.allowedTools']    = allowedTools;
    if (Array.isArray(allowedProjects)) updates['policy.allowedProjects'] = allowedProjects;

    await db.collection('agents').updateOne(
      { agentId: req.params.agentId },
      { $set: updates }
    );

    const updated = await getAgentById(req.params.agentId);
    res.json({ success: true, message: 'Agent updated.', data: updated });

  } catch (error) {
    console.error('Update agent error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
// PATCH /api/agents/:agentId/policy
// Update the permission policy for an agent
// ============================================================

router.patch('/:agentId/policy', requireDeveloperAuth, async (req, res) => {
  try {
    const { policy } = req.body;

    if (!policy || typeof policy !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Request body must contain a "policy" object'
      });
    }

    const updatedPolicy = await updateAgentPolicy(
      req.params.agentId,
      req.developer.developerId,
      policy
    );

    res.json({
      success: true,
      message: 'Agent policy updated. Active sessions will use the new policy on next token refresh.',
      data: {
        agentId:       req.params.agentId,
        updatedPolicy
      }
    });

  } catch (error) {
    console.error('Update agent policy error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// POST /api/agents/:agentId/rotate-secret
// Rotate the agent secret — invalidates all existing sessions
// ============================================================

router.post('/:agentId/rotate-secret', requireDeveloperAuth, async (req, res) => {
  try {
    const result = await rotateAgentSecret(
      req.params.agentId,
      req.developer.developerId
    );

    res.json({
      success: true,
      message: 'Agent secret rotated. All existing sessions have been revoked. Store the new secret securely.',
      data: {
        agentId:     result.agentId,
        agentSecret: result.agentSecret,   // ONE-TIME display
        rotatedAt:   result.rotatedAt
      }
    });

  } catch (error) {
    console.error('Rotate secret error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// DELETE /api/agents/:agentId
// Deactivate an agent and revoke all its sessions
// ============================================================

router.delete('/:agentId', requireDeveloperAuth, async (req, res) => {
  try {
    const result = await deactivateAgent(
      req.params.agentId,
      req.developer.developerId
    );

    res.json({
      success: true,
      message: `Agent ${result.agentId} deactivated and ${result.sessionsRevoked} session(s) revoked.`,
      data: result
    });

  } catch (error) {
    console.error('Deactivate agent error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// DELETE /api/agents/:agentId/sessions
// Revoke all active sessions for an agent (without deactivating)
// ============================================================

router.delete('/:agentId/sessions', requireDeveloperAuth, async (req, res) => {
  try {
    const agentId = req.params.agentId;

    // Verify ownership first
    const agent = await getAgentById(agentId);
    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied — this agent belongs to a different developer'
      });
    }

    const db = getDatabase();
    const result = await db.collection('agent_sessions').updateMany(
      { agentId, revoked: false },
      {
        $set: {
          revoked:       true,
          revokedAt:     new Date(),
          revokedReason: 'manual_revocation'
        }
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} session(s) revoked for agent ${agentId}.`,
      data: {
        agentId,
        sessionsRevoked: result.modifiedCount
      }
    });

  } catch (error) {
    console.error('Revoke sessions error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// GET /api/agents/:agentId/sessions
// List active sessions for an agent
// ============================================================

router.get('/:agentId/sessions', requireDeveloperAuth, async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const agent   = await getAgentById(agentId);

    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied — this agent belongs to a different developer'
      });
    }

    const db       = getDatabase();
    const now      = new Date();
    const sessions = await db.collection('agent_sessions')
      .find({ agentId })
      .project({ refreshTokenHash: 0 })   // never expose refresh token hash
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json({
      success: true,
      data: {
        agentId,
        sessions: sessions.map(s => ({
          sessionId:   s.sessionId,
          active:      !s.revoked && s.expiresAt > now,
          revoked:     s.revoked,
          createdAt:   s.createdAt,
          expiresAt:   s.expiresAt,
          lastUsedAt:  s.lastUsedAt,
          revokedAt:   s.revokedAt    || null,
          revokedReason: s.revokedReason || null
        }))
      }
    });

  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// PHASE 4 — Policy Management Endpoints
// ============================================================

// GET /api/agents/:agentId/policy
// Returns the full policy document including all rules
router.get('/:agentId/policy', requireDeveloperAuth, async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = await getAgentById(agentId);
    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied — this agent belongs to a different developer'
      });
    }

    const policyDoc = await getPolicyDocument(agentId);

    res.json({
      success: true,
      data: {
        agentId,
        agentName:  agent.name,
        ruleCount:  policyDoc.policies?.length ?? 0,
        policies:   policyDoc.policies ?? [],
        updatedAt:  policyDoc.updatedAt
      }
    });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// POST /api/agents/:agentId/policy/rules
// Add a single policy rule (inserted before the catch-all deny)
router.post('/:agentId/policy/rules', requireDeveloperAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { resource, effect, conditions, description } = req.body;

    if (!resource || !effect) {
      return res.status(400).json({
        success: false,
        error: "'resource' and 'effect' are required"
      });
    }

    if (!['allow', 'deny'].includes(effect)) {
      return res.status(400).json({
        success: false,
        error: "effect must be 'allow' or 'deny'"
      });
    }

    const agent = await getAgentById(agentId);
    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied — this agent belongs to a different developer'
      });
    }

    const newRule = await addPolicyRule(agentId, { resource, effect, conditions, description });

    res.status(201).json({
      success:    true,
      message:    'Policy rule added',
      data:       { rule: newRule }
    });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// DELETE /api/agents/:agentId/policy/rules/:ruleId
// Remove a rule by its ID (cannot remove the catch-all deny)
router.delete('/:agentId/policy/rules/:ruleId', requireDeveloperAuth, async (req, res) => {
  try {
    const { agentId, ruleId } = req.params;

    const agent = await getAgentById(agentId);
    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied — this agent belongs to a different developer'
      });
    }

    const result = await removePolicyRule(agentId, ruleId);

    res.json({
      success: true,
      message: `Rule '${ruleId}' removed`,
      data:    result
    });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// PUT /api/agents/:agentId/policy/rules
// Replace the entire rules array (always appends a catch-all deny)
router.put('/:agentId/policy/rules', requireDeveloperAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { rules }   = req.body;

    if (!Array.isArray(rules)) {
      return res.status(400).json({
        success: false,
        error:   "'rules' must be an array"
      });
    }

    const agent = await getAgentById(agentId);
    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied — this agent belongs to a different developer'
      });
    }

    const updated = await replacePolicyRules(agentId, rules);

    res.json({
      success:   true,
      message:   `Policy replaced with ${updated.length} rules`,
      data:      { ruleCount: updated.length, policies: updated }
    });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// POST /api/agents/:agentId/policy/simulate
// Test what decision the policy engine would return for a given call
router.post('/:agentId/policy/simulate', requireDeveloperAuth, async (req, res) => {
  try {
    const { agentId }  = req.params;
    const { toolName, operation = 'read', projectId = null } = req.body;

    if (!toolName) {
      return res.status(400).json({
        success: false,
        error:   "'toolName' is required"
      });
    }

    const agent = await getAgentById(agentId);
    if (agent.developerId.toString() !== req.developer.developerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied — this agent belongs to a different developer'
      });
    }

    const simulation = await simulatePolicy(agentId, toolName, { operation, projectId });

    res.json({
      success: true,
      data:    simulation
    });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

export { router as agentRoutes };
