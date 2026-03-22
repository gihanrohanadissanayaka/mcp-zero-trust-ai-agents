#!/usr/bin/env node

// ============================================================
// Zero Trust Middleware
// Zero Trust MCP — Phase 4 (Policy Engine)
//
// withZeroTrust(toolName, toolHandler)
//
// Every MCP tool call passes through a 10-step check chain:
//
//  1.  Token present?                → MCP_AGENT_TOKEN env var or _token param
//  2.  JWT signature valid?          → HS256 verify
//  3.  Token not expired?            → exp claim
//  4.  Session not revoked?          → DB check (stateful)
//  5.  Agent still active?           → agents collection
//  6.  Policy evaluation             → live agent_policies DB lookup (replaces
//                                       static JWT-claim checks for tool/project/op)
//                                       Rules evaluated top-down; first match wins;
//                                       default DENY if no rule matches.
//  7.  (merged into step 6)          → project scope evaluated by policyEngine
//  8.  (merged into step 6)          → operation type evaluated by policyEngine
//  9.  Rate limit not exceeded?      → sliding window in agent_audit_log
// 10.  Write audit log entry         → always, pass or fail
// ============================================================

import { verifyAccessToken } from './tokenService.js';
import { getDatabase } from '../config/database/connection.js';
import { evaluatePolicy } from './policyEngine.js';

// ============================================================
// CONSTANTS
// ============================================================

// Tools that mutate data require 'write' or 'admin'
const WRITE_TOOLS = new Set([
  'usecases_upsert',
  'api_document_link',
  'project_bootstrap',
  'usecase_sync_automation',
  'scaffold_create'
]);

// Tools that require 'admin' permission
const ADMIN_TOOLS = new Set([
  // Reserved for future admin-only tools
]);

// Default rate limit (requests per minute) — overridable per agent via policy
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

// ============================================================
// RATE LIMITER — sliding window via agent_audit_log
// ============================================================

async function checkRateLimit(agentId, rateLimit) {
  const db          = getDatabase();
  const windowStart = new Date(Date.now() - 60 * 1000);  // last 60 seconds
  const limit       = rateLimit?.requestsPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;

  const recentCalls = await db.collection('agent_audit_log').countDocuments({
    agentId,
    timestamp: { $gte: windowStart }
  });

  return {
    allowed:   recentCalls < limit,
    current:   recentCalls,
    limit,
    resetAt:   new Date(windowStart.getTime() + 60 * 1000)
  };
}

// ============================================================
// AUDIT LOGGER
// ============================================================

async function writeAuditLog(entry) {
  try {
    const db = getDatabase();
    await db.collection('agent_audit_log').insertOne({
      ...entry,
      timestamp: new Date()
    });
  } catch (err) {
    // Audit log failure must never block a tool call
    console.error('⚠️  Audit log write failed:', err.message);
  }
}

// ============================================================
// OPERATION TYPE RESOLVER
// ============================================================

function resolveRequiredOperation(toolName) {
  if (ADMIN_TOOLS.has(toolName)) return 'admin';
  if (WRITE_TOOLS.has(toolName)) return 'write';
  return 'read';
}

// ============================================================
// FAILED RESPONSE BUILDER
// ============================================================

function denyResponse(code, message, extra = {}) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error:   code,
        message,
        ...extra
      }, null, 2)
    }],
    isError: true
  };
}

// ============================================================
// MAIN WRAPPER — withZeroTrust
// ============================================================

/**
 * Wraps an MCP tool handler with the full Zero Trust check chain.
 *
 * @param {string}   toolName       - The registered tool name (e.g. 'usecases_search')
 * @param {Function} toolHandler    - The original async tool handler
 * @returns {Function}              - Enhanced handler for server.registerTool()
 *
 * Token resolution order:
 *   1. params._token          (preferred — agent passes per-call)
 *   2. process.env.MCP_AGENT_TOKEN  (fallback — set in MCP client config)
 */
export function withZeroTrust(toolName, toolHandler) {
  const requiredOperation = resolveRequiredOperation(toolName);

  return async (params) => {
    const startTime = Date.now();

    // ── Step 1: Extract token ────────────────────────────────
    const rawToken =
      params._token ||
      process.env.MCP_AGENT_TOKEN ||
      null;

    if (!rawToken) {
      await writeAuditLog({
        agentId:        'unknown',
        developerId:    'unknown',
        sessionId:      'unknown',
        tool:           toolName,
        decision:       'deny',
        denyReason:     'missing_token',
        params:         sanitizeParams(params),
        durationMs:     Date.now() - startTime,
        responseStatus: 'error'
      });

      return denyResponse(
        'MISSING_TOKEN',
        'No access token provided. Include _token in your tool call params or set MCP_AGENT_TOKEN env var.',
        { hint: 'Authenticate via POST /api/agents/authenticate to get an access token.' }
      );
    }

    // ── Step 2–5: Verify JWT + session + agent ───────────────
    const verifyResult = await verifyAccessToken(rawToken);

    if (!verifyResult.valid) {
      await writeAuditLog({
        agentId:        tryDecodeAgentId(rawToken),
        developerId:    'unknown',
        sessionId:      'unknown',
        tool:           toolName,
        decision:       'deny',
        denyReason:     verifyResult.code ?? 'invalid_token',
        params:         sanitizeParams(params),
        durationMs:     Date.now() - startTime,
        responseStatus: 'error'
      });

      // Give actionable hint for expired tokens
      if (verifyResult.code === 'EXPIRED') {
        return denyResponse(
          'TOKEN_EXPIRED',
          verifyResult.error,
          { hint: 'Use your refresh token via POST /api/agents/refresh to get a new access token.' }
        );
      }

      return denyResponse('AUTH_FAILED', verifyResult.error);
    }

    const { claims, session } = verifyResult;

    // ── Steps 6-8: Policy Engine evaluation ─────────────────
    // Replaces the old inline JWT-claim checks. The policy engine
    // reads live rules from agent_policies collection, so policy
    // changes made after token issuance take effect immediately.
    const requestedProject = params.projectId ?? null;

    const policyResult = await evaluatePolicy(
      session.agentId,
      toolName,
      { projectId: requestedProject, operation: requiredOperation }
    );

    if (policyResult.decision !== 'allow') {
      await writeAuditLog({
        agentId:        session.agentId,
        developerId:    session.developerId,
        sessionId:      session.sessionId,
        tool:           toolName,
        decision:       'deny',
        denyReason:     policyResult.reason,
        policyRule:     policyResult.matchedRule ?? null,
        params:         sanitizeParams(params),
        durationMs:     Date.now() - startTime,
        responseStatus: 'error'
      });

      // Provide specific error codes for common policy deny reasons
      if (policyResult.reason === 'no_policies_defined') {
        return denyResponse(
          'NO_POLICY_DEFINED',
          `No policy rules defined for agent '${session.agentName}'. Ask the developer to configure permissions.`,
          { hint: policyResult.hint ?? 'PATCH /api/agents/:agentId/policy' }
        );
      }

      return denyResponse(
        'POLICY_DENIED',
        `Access denied for tool '${toolName}' — policy rule rejected this request.`,
        {
          tool:           toolName,
          operation:      requiredOperation,
          projectId:      requestedProject,
          reason:         policyResult.reason,
          matchedRule:    policyResult.matchedRule ?? null,
          hint:           'Update agent policy rules via PATCH /api/agents/:agentId/policy'
        }
      );
    }

    // Policy allowed — log which rule matched for traceability
    console.error(
      `🔐 [Policy] ${toolName} ALLOW | rule: ${
        policyResult.matchedRule?.id ?? policyResult.reason
      } | agent: ${session.agentName}`
    );

    // ── Step 9: Rate limit check ─────────────────────────────
    let ratePolicy;
    try {
      const db    = getDatabase();
      const agent = await db.collection('agents').findOne(
        { agentId: session.agentId },
        { projection: { 'policy.rateLimit': 1 } }
      );
      ratePolicy = agent?.policy?.rateLimit;
    } catch {
      // Non-fatal — fall back to default
    }

    const rateCheck = await checkRateLimit(session.agentId, ratePolicy);
    if (!rateCheck.allowed) {
      await writeAuditLog({
        agentId:        session.agentId,
        developerId:    session.developerId,
        sessionId:      session.sessionId,
        tool:           toolName,
        decision:       'deny',
        denyReason:     'rate_limit_exceeded',
        params:         sanitizeParams(params),
        durationMs:     Date.now() - startTime,
        responseStatus: 'error'
      });

      return denyResponse(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded: ${rateCheck.current}/${rateCheck.limit} requests in the last minute.`,
        { resetAt: rateCheck.resetAt }
      );
    }

    // ── All checks passed — invoke tool handler ──────────────
    console.error(
      `✅ [ZeroTrust] ${toolName} | agent: ${session.agentName} (${session.agentId}) | op: ${requiredOperation}`
    );

    // Build auth context injected into the handler as _ztAuth
    const ztAuth = {
      agentId:           session.agentId,
      agentName:         session.agentName,
      developerId:       session.developerId,
      sessionId:         session.sessionId,
      allowedTools:      claims.allowedTools      ?? [],
      allowedProjects:   claims.allowedProjects   ?? [],
      allowedOperations: claims.allowedOperations ?? ['read'],
      sessionContext:    session.sessionContext
    };

    // Strip _token from params before passing to handler
    const { _token, ...cleanParams } = params;

    let handlerResult;
    let responseStatus = 'success';

    try {
      handlerResult = await toolHandler({ ...cleanParams, _ztAuth: ztAuth });
      if (handlerResult?.isError) responseStatus = 'error';
    } catch (err) {
      responseStatus = 'error';
      await writeAuditLog({
        agentId:        session.agentId,
        developerId:    session.developerId,
        sessionId:      session.sessionId,
        tool:           toolName,
        decision:       'allow',
        denyReason:     null,
        params:         sanitizeParams(params),
        durationMs:     Date.now() - startTime,
        responseStatus: 'error',
        errorMessage:   err.message
      });

      return denyResponse('TOOL_EXECUTION_ERROR', err.message);
    }

    // ── Step 10: Write audit log (success) ───────────────────
    await writeAuditLog({
      agentId:        session.agentId,
      developerId:    session.developerId,
      sessionId:      session.sessionId,
      tool:           toolName,
      decision:       'allow',
      denyReason:     null,
      params:         sanitizeParams(params),
      durationMs:     Date.now() - startTime,
      responseStatus
    });

    return handlerResult;
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Remove sensitive fields from params before storing in audit log.
 */
function sanitizeParams(params) {
  const { _token, password, secret, ...safe } = params;
  return safe;
}

/**
 * Best-effort decode of agentId from a JWT without verifying.
 * Used only for audit logging when verification fails.
 */
function tryDecodeAgentId(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
    );
    return payload.sub ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
