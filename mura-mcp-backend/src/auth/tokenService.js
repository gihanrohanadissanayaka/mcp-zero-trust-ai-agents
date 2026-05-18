#!/usr/bin/env node

// ============================================================
// JWT Session Token Service
// Zero Trust MCP — Phase 2
//
// Responsibilities:
//   - Issue short-lived JWT access tokens after agent auth
//   - Issue long-lived refresh tokens (stored hashed in DB)
//   - Verify JWT signature, expiry, and session revocation
//   - Refresh expired access tokens using a valid refresh token
//   - Revoke individual sessions or all sessions for an agent
//
// Token lifecycle:
//   agentId + agentSecret
//       └─► issueSessionToken()
//               ├─► access token  (JWT, short-lived: 15–60 min)
//               └─► refresh token (opaque, long-lived: 7 days, hashed in DB)
//
//   On every MCP tool call:
//       └─► verifyAccessToken()
//               ├─► verify JWT signature
//               ├─► check expiry
//               ├─► check session not revoked (DB)
//               └─► return decoded claims
// ============================================================

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { getDatabase } from '../config/database/connection.js';
import { validateAgentCredentials } from './agentAuth.js';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  issuer:               'mcp-hub',
  audience:             'mcp-hub-tools',
  accessTokenLifetime:  Number.parseInt(process.env.SESSION_TIMEOUT  || '3600',  10),    // seconds (default 1hr)
  refreshTokenLifetime: Number.parseInt(process.env.REFRESH_TIMEOUT  || '604800', 10),  // seconds (default 7 days)
  bcryptRounds:         Number.parseInt(process.env.BCRYPT_ROUNDS    || '10',     10),

  get jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be set and at least 32 characters long');
    }
    return secret;
  }
};

const SESSION_ID_PREFIX      = 'sess';
const REFRESH_TOKEN_PREFIX   = 'ztrefresh';

// ============================================================
// GENERATORS
// ============================================================

function generateSessionId() {
  return `${SESSION_ID_PREFIX}_${Date.now().toString(36)}_${crypto.randomBytes(12).toString('hex')}`;
}

function generateRefreshToken() {
  return `${REFRESH_TOKEN_PREFIX}_${crypto.randomBytes(40).toString('hex')}`;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Authenticate an agent and issue a session token pair.
 *
 * @param {string} agentId       - The agent's public identifier
 * @param {string} rawSecret     - The agent's raw secret
 * @param {string} [context]     - Optional context tag (e.g. 'vscode', 'ci-pipeline')
 * @returns {{
 *   accessToken:  string,   JWT — include in every MCP tool call
 *   refreshToken: string,   Opaque — store securely, use to refresh
 *   sessionId:    string,
 *   expiresIn:    number,   seconds until access token expires
 *   expiresAt:    Date,
 *   agent: { agentId, name, allowedTools, allowedProjects, allowedOperations }
 * }}
 */
export async function issueSessionToken(agentId, rawSecret, context = 'mcp-client', requestedDurationMinutes = null) {
  // 1. Validate agent credentials
  const authResult = await validateAgentCredentials(agentId, rawSecret);
  if (!authResult.valid) {
    throw new Error(authResult.error || 'Authentication failed');
  }

  const { agent } = authResult;
  const db         = getDatabase();
  const now        = new Date();

  // 2. Determine token lifetimes (respect agent-level session duration)
  //    requestedDurationMinutes is capped by the agent policy max (or 10080 = 1 week)
  const policyMaxMins  = agent.policy?.maxSessionDurationMinutes || 60;
  const requestedSecs  = requestedDurationMinutes ? requestedDurationMinutes * 60 : null;
  const policyMaxSecs  = policyMaxMins * 60;
  const configMaxSecs  = CONFIG.accessTokenLifetime;            // e.g. 3600
  const WEEK_SECS      = 7 * 24 * 60 * 60;                     // hard cap: 1 week
  const accessLifetimeSecs = requestedSecs
    ? Math.min(requestedSecs, policyMaxSecs, WEEK_SECS)
    : Math.min(configMaxSecs, policyMaxSecs);

  const accessExpiresAt  = new Date(now.getTime() + accessLifetimeSecs * 1000);
  const refreshExpiresAt = new Date(now.getTime() + CONFIG.refreshTokenLifetime * 1000);

  // 3. Generate session identifiers
  const sessionId    = generateSessionId();
  const refreshToken = generateRefreshToken();
  const refreshHash  = await bcrypt.hash(refreshToken, CONFIG.bcryptRounds);

  // 4. Build JWT payload — embed policy claims directly for stateless verification
  const jwtPayload = {
    // Standard claims
    sub: agentId,
    iss: CONFIG.issuer,
    aud: CONFIG.audience,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(accessExpiresAt.getTime() / 1000),
    jti: sessionId,

    // Zero Trust custom claims
    developerId:       agent.developerId.toString(),
    agentName:         agent.name,
    allowedTools:      agent.policy?.allowedTools      || [],
    allowedProjects:   agent.policy?.allowedProjects   || [],
    allowedOperations: agent.policy?.allowedOperations || ['read'],
    allowedServices:   agent.policy?.allowedServices   || [],
    sessionContext:    context
  };

  // 5. Sign access token
  const accessToken = jwt.sign(jwtPayload, CONFIG.jwtSecret, { algorithm: 'HS256' });

  // 6. Persist session record in MongoDB
  const sessionDoc = {
    sessionId,
    agentId,
    developerId:       agent.developerId,
    agentName:         agent.name,

    // Hashed refresh token (never store raw)
    refreshTokenHash:  refreshHash,
    refreshExpiresAt,

    // Snapshot of policy at time of issue (for audit queries)
    allowedTools:      agent.policy?.allowedTools      || [],
    allowedProjects:   agent.policy?.allowedProjects   || [],
    allowedOperations: agent.policy?.allowedOperations || ['read'],
    allowedServices:   agent.policy?.allowedServices   || [],
    sessionContext:    context,

    // Lifecycle
    revoked:    false,
    createdAt:  now,
    expiresAt:  accessExpiresAt,   // TTL index will auto-expire this
    lastUsedAt: now,

    revokedAt:     null,
    revokedReason: null
  };

  await db.collection('agent_sessions').insertOne(sessionDoc);

  // 7. Update agent lastUsedAt
  await db.collection('agents').updateOne(
    { agentId },
    { $set: { lastUsedAt: now } }
  );

  console.log(`🎫 Session issued: ${sessionId} for agent ${agentId} (context: ${context})`);

  return {
    accessToken,
    refreshToken,      // RAW — caller must store securely
    sessionId,
    tokenType:   'Bearer',
    expiresIn:   accessLifetimeSecs,
    expiresAt:   accessExpiresAt,
    agent: {
      agentId,
      name:              agent.name,
      allowedTools:      agent.policy?.allowedTools      || [],
      allowedProjects:   agent.policy?.allowedProjects   || [],
      allowedOperations: agent.policy?.allowedOperations || ['read'],
      allowedServices:   agent.policy?.allowedServices   || []
    }
  };
}

/**
 * Verify a JWT access token.
 * Performs: signature check → expiry check → revocation check.
 *
 * @param {string} token - Raw JWT string (without "Bearer " prefix)
 * @returns {{
 *   valid: boolean,
 *   claims?: object,   decoded JWT payload if valid
 *   error?:  string,
 *   code?:   'EXPIRED' | 'INVALID' | 'REVOKED' | 'MISSING'
 * }}
 */
export async function verifyAccessToken(token) {
  if (!token) {
    return { valid: false, error: 'Access token is required', code: 'MISSING' };
  }

  // 1. Verify JWT signature and expiry (stateless)
  let decoded;
  try {
    decoded = jwt.verify(token, CONFIG.jwtSecret, {
      issuer:   CONFIG.issuer,
      audience: CONFIG.audience,
      algorithms: ['HS256']
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, error: 'Access token has expired. Use your refresh token.', code: 'EXPIRED' };
    }
    return { valid: false, error: `Invalid token: ${err.message}`, code: 'INVALID' };
  }

  const sessionId = decoded.jti;
  const agentId   = decoded.sub;

  // 2. Check session revocation in DB (stateful check — zero trust requires this)
  const db      = getDatabase();
  const session = await db.collection('agent_sessions').findOne({ sessionId });

  if (!session) {
    return { valid: false, error: 'Session not found', code: 'INVALID' };
  }

  if (session.revoked) {
    const reasonSuffix = session.revokedReason ? `: ${session.revokedReason}` : '';
    return {
      valid: false,
      error: `Session has been revoked${reasonSuffix}`,
      code:  'REVOKED'
    };
  }

  // 3. Verify agent is still active
  const agent = await db.collection('agents').findOne({ agentId, active: true });
  if (!agent) {
    return { valid: false, error: 'Agent is inactive or not found', code: 'INVALID' };
  }

  // 4. Update session lastUsedAt (non-blocking — don't await to keep latency low)
  db.collection('agent_sessions').updateOne(
    { sessionId },
    { $set: { lastUsedAt: new Date() } }
  ).catch(err => console.error('Failed to update session lastUsedAt:', err));

  db.collection('agents').updateOne(
    { agentId },
    { $set: { lastUsedAt: new Date() }, $inc: { 'stats.totalToolCalls': 1 } }
  ).catch(err => console.error('Failed to update agent stats:', err));

  return {
    valid:  true,
    claims: decoded,
    session: {
      sessionId,
      agentId,
      developerId:       decoded.developerId,
      agentName:         decoded.agentName,
      allowedTools:      decoded.allowedTools      || [],
      allowedProjects:   decoded.allowedProjects   || [],
      allowedOperations: decoded.allowedOperations || ['read'],
      allowedServices:   decoded.allowedServices   || [],
      sessionContext:    decoded.sessionContext
    }
  };
}

/**
 * Refresh an expired access token using a valid refresh token.
 * Issues a new access token. Refresh token itself is rotated (old one invalidated).
 *
 * @param {string} refreshToken - Raw refresh token string
 * @returns {same shape as issueSessionToken()}
 */
export async function refreshSession(refreshToken) {
  if (!refreshToken) {
    throw new Error('Refresh token is required');
  }

  if (!refreshToken.startsWith(REFRESH_TOKEN_PREFIX)) {
    throw new Error('Invalid refresh token format');
  }

  const db  = getDatabase();
  const now = new Date();

  // 1. Find sessions with unexpired, unrevoked refresh tokens for this token prefix
  //    We query on agentId embedded in token + check all candidates
  //    (bcrypt compare each candidate — bounded by small result set)
  const candidates = await db.collection('agent_sessions')
    .find({
      revoked:          false,
      refreshExpiresAt: { $gt: now }
    })
    .sort({ createdAt: -1 })
    .limit(20)   // safety limit
    .toArray();

  let matchedSession = null;
  for (const candidate of candidates) {
    const match = await bcrypt.compare(refreshToken, candidate.refreshTokenHash);
    if (match) {
      matchedSession = candidate;
      break;
    }
  }

  if (!matchedSession) {
    throw new Error('Invalid or expired refresh token');
  }

  // 2. Revoke the old session (refresh token rotation — prevents replay)
  await db.collection('agent_sessions').updateOne(
    { sessionId: matchedSession.sessionId },
    {
      $set: {
        revoked:       true,
        revokedAt:     now,
        revokedReason: 'refresh_token_rotated'
      }
    }
  );

  // 3. Get fresh agent record (policy may have changed since last session)
  const agent = await db.collection('agents').findOne({
    agentId: matchedSession.agentId,
    active:  true
  });

  if (!agent) {
    throw new Error('Agent is no longer active');
  }

  // 4. Issue a new session using the fresh policy
  const agentMaxSecs       = (agent.policy?.maxSessionDurationMinutes || 60) * 60;
  const accessLifetimeSecs = Math.min(CONFIG.accessTokenLifetime, agentMaxSecs);

  const accessExpiresAt  = new Date(now.getTime() + accessLifetimeSecs * 1000);
  const refreshExpiresAt = new Date(now.getTime() + CONFIG.refreshTokenLifetime * 1000);

  const newSessionId    = generateSessionId();
  const newRefreshToken = generateRefreshToken();
  const newRefreshHash  = await bcrypt.hash(newRefreshToken, CONFIG.bcryptRounds);

  const jwtPayload = {
    sub: agent.agentId,
    iss: CONFIG.issuer,
    aud: CONFIG.audience,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(accessExpiresAt.getTime() / 1000),
    jti: newSessionId,

    developerId:       agent.developerId.toString(),
    agentName:         agent.name,
    allowedTools:      agent.policy?.allowedTools      || [],
    allowedProjects:   agent.policy?.allowedProjects   || [],
    allowedOperations: agent.policy?.allowedOperations || ['read'],
    allowedServices:   agent.policy?.allowedServices   || [],
    sessionContext:    matchedSession.sessionContext
  };

  const newAccessToken = jwt.sign(jwtPayload, CONFIG.jwtSecret, { algorithm: 'HS256' });

  // 5. Persist new session
  await db.collection('agent_sessions').insertOne({
    sessionId:       newSessionId,
    agentId:         agent.agentId,
    developerId:     agent.developerId,
    agentName:       agent.name,
    refreshTokenHash: newRefreshHash,
    refreshExpiresAt,
    allowedTools:    agent.policy?.allowedTools      || [],
    allowedProjects: agent.policy?.allowedProjects   || [],
    allowedOperations: agent.policy?.allowedOperations || ['read'],
    allowedServices: agent.policy?.allowedServices   || [],
    sessionContext:  matchedSession.sessionContext,
    refreshedFrom:   matchedSession.sessionId,
    revoked:         false,
    createdAt:       now,
    expiresAt:       accessExpiresAt,
    lastUsedAt:      now,
    revokedAt:       null,
    revokedReason:   null
  });

  console.log(
    `🔄 Session refreshed: ${matchedSession.sessionId} → ${newSessionId} for agent ${agent.agentId}`
  );

  return {
    accessToken:  newAccessToken,
    refreshToken: newRefreshToken,   // RAW new refresh token
    sessionId:    newSessionId,
    tokenType:    'Bearer',
    expiresIn:    accessLifetimeSecs,
    expiresAt:    accessExpiresAt,
    agent: {
      agentId:           agent.agentId,
      name:              agent.name,
      allowedTools:      agent.policy?.allowedTools      || [],
      allowedProjects:   agent.policy?.allowedProjects   || [],
      allowedOperations: agent.policy?.allowedOperations || ['read'],
      allowedServices:   agent.policy?.allowedServices   || []
    }
  };
}

/**
 * Revoke a specific session by its sessionId.
 *
 * @param {string} sessionId
 * @param {string} [reason] - Human-readable revocation reason
 */
export async function revokeSession(sessionId, reason = 'manual_revocation') {
  if (!sessionId) throw new Error('sessionId is required');

  const db  = getDatabase();
  const now = new Date();

  const result = await db.collection('agent_sessions').updateOne(
    { sessionId, revoked: false },
    { $set: { revoked: true, revokedAt: now, revokedReason: reason } }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Session '${sessionId}' not found or already revoked`);
  }

  console.log(`⛔ Session revoked: ${sessionId} (reason: ${reason})`);
  return { sessionId, revoked: true, revokedAt: now, reason };
}

/**
 * Revoke all active sessions for a given agent.
 *
 * @param {string} agentId
 * @param {string} [reason]
 * @returns {{ revoked: number }}
 */
export async function revokeAllAgentSessions(agentId, reason = 'bulk_revocation') {
  if (!agentId) throw new Error('agentId is required');

  const db  = getDatabase();
  const now = new Date();

  const result = await db.collection('agent_sessions').updateMany(
    { agentId, revoked: false },
    { $set: { revoked: true, revokedAt: now, revokedReason: reason } }
  );

  console.log(`⛔ ${result.modifiedCount} sessions revoked for agent ${agentId} (reason: ${reason})`);
  return { agentId, revoked: result.modifiedCount, reason };
}

/**
 * Introspect a token — returns full session details without verifying.
 * Useful for admin/audit tooling.
 */
export async function introspectToken(token) {
  try {
    // Decode without verifying (expired tokens are still introspectable)
    const decoded = jwt.decode(token);
    if (!decoded) return { active: false, error: 'Cannot decode token' };

    const db      = getDatabase();
    const session = await db.collection('agent_sessions').findOne({
      sessionId: decoded.jti
    });

    const now    = new Date();
    const active = !session?.revoked && decoded.exp > Math.floor(now.getTime() / 1000);

    return {
      active,
      sessionId:         decoded.jti,
      agentId:           decoded.sub,
      developerId:       decoded.developerId,
      allowedTools:      decoded.allowedTools,
      allowedProjects:   decoded.allowedProjects,
      allowedOperations: decoded.allowedOperations,
      allowedServices:   decoded.allowedServices   || [],
      issuedAt:   new Date(decoded.iat * 1000),
      expiresAt:  new Date(decoded.exp * 1000),
      revoked:    session?.revoked  ?? false,
      revokedAt:  session?.revokedAt ?? null,
      revokedReason: session?.revokedReason ?? null
    };
  } catch (err) {
    return { active: false, error: err.message };
  }
}

// Export config values for use in middleware
export { CONFIG as TOKEN_CONFIG };
