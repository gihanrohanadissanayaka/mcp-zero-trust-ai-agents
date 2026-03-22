#!/usr/bin/env node

// ============================================================
// Agent Identity & Registration Service
// Zero Trust MCP — Phase 1
//
// Responsibilities:
//   - Register AI agent identities under a developer account
//   - Generate & hash agent secrets (like OAuth2 client_secret)
//   - Validate agent credentials for session token exchange
//   - Manage agent lifecycle (activate / deactivate)
//   - Store and enforce per-agent permission policies
// ============================================================

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { getDatabase } from '../config/database/connection.js';

// ============================================================
// CONSTANTS
// ============================================================

const AGENT_ID_PREFIX     = 'agt';
const SECRET_BCRYPT_ROUNDS = 12;

// Default policy applied to every new agent — deny everything until explicitly granted
const DEFAULT_POLICY = {
  allowedTools:       [],          // empty = no tools allowed
  allowedProjects:    [],          // empty = no projects allowed
  allowedOperations:  ['read'],    // read-only by default
  maxSessionDurationMinutes: 30,   // 30-min sessions by default
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerHour:   500
  }
};

// ============================================================
// CREDENTIAL GENERATORS
// ============================================================

/**
 * Generate a unique agent ID.
 * Format: agt_<base36-timestamp>_<16-byte-hex>
 */
function generateAgentId() {
  const timestamp  = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `${AGENT_ID_PREFIX}_${timestamp}_${randomPart}`;
}

/**
 * Generate a raw agent secret (shown ONCE to the developer, then hashed).
 * Format: agtsec_<32-byte-hex>
 */
function generateAgentSecret() {
  return `agtsec_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Hash the agent secret before storing in DB.
 */
async function hashSecret(secret) {
  return bcrypt.hash(secret, SECRET_BCRYPT_ROUNDS);
}

/**
 * Verify a raw secret against a stored hash.
 */
async function verifySecret(rawSecret, storedHash) {
  return bcrypt.compare(rawSecret, storedHash);
}

// ============================================================
// SERVICE FUNCTIONS
// ============================================================

/**
 * Register a new AI agent under a developer account.
 *
 * @param {object} params
 * @param {string} params.developerId        - MongoDB ObjectId string of the owning developer
 * @param {string} params.name               - Human-readable agent name
 * @param {string} [params.description]      - Optional description
 * @param {string} [params.agentType]        - 'ai_assistant' | 'automation' | 'ci_bot' etc.
 * @param {object} [params.policy]           - Override default policy
 * @returns {{ agentId, agentSecret, agent }}
 *   agentSecret is returned RAW here (only time) — caller must store it securely
 */
export async function registerAgent({
  developerId,
  name,
  description = '',
  agentType   = 'ai_assistant',
  policy      = {}
}) {
  if (!developerId) throw new Error('developerId is required');
  if (!name)        throw new Error('Agent name is required');

  const db = getDatabase();

  // Verify the developer exists
  const { ObjectId } = await import('mongodb');
  let devObjectId;
  try {
    devObjectId = new ObjectId(developerId);
  } catch {
    throw new Error('Invalid developerId format');
  }

  const developer = await db.collection('developers').findOne({ _id: devObjectId });
  if (!developer) throw new Error('Developer not found');

  // Enforce max agents per developer (prevent abuse)
  const MAX_AGENTS_PER_DEVELOPER = 20;
  const existingCount = await db.collection('agents').countDocuments({
    developerId: devObjectId,
    active: true
  });
  if (existingCount >= MAX_AGENTS_PER_DEVELOPER) {
    throw new Error(`Maximum of ${MAX_AGENTS_PER_DEVELOPER} agents per developer reached`);
  }

  // Generate credentials
  const agentId     = generateAgentId();
  const agentSecret = generateAgentSecret();
  const secretHash  = await hashSecret(agentSecret);

  // Merge caller policy with defaults (caller values win)
  const mergedPolicy = {
    ...DEFAULT_POLICY,
    ...policy,
    rateLimit: {
      ...DEFAULT_POLICY.rateLimit,
      ...policy.rateLimit
    }
  };

  const now = new Date();

  const agentDoc = {
    agentId,
    secretHash,                             // NEVER include raw secret in DB
    name,
    description,
    agentType,                              // 'ai_assistant' | 'automation' | 'ci_bot'
    developerId:  devObjectId,
    developerEmail: developer.email,

    // Zero Trust policy embedded on the agent record
    policy: mergedPolicy,

    // Lifecycle
    active:      true,
    createdAt:   now,
    updatedAt:   now,
    lastAuthAt:  null,
    lastUsedAt:  null,

    // Stats (updated by token/audit services)
    stats: {
      totalSessions:  0,
      totalToolCalls: 0,
      failedAuths:    0
    },

    metadata: {}
  };

  await db.collection('agents').insertOne(agentDoc);

  // Write initial policy document to agent_policies collection
  await db.collection('agent_policies').insertOne({
    agentId,
    developerId: devObjectId,
    policies: buildDefaultPolicyRules(mergedPolicy),
    createdAt:  now,
    updatedAt:  now
  });

  console.log(`✅ Agent registered: ${agentId} (${name}) for developer ${developer.email}`);

  return {
    agentId,
    agentSecret,   // Raw — show ONCE, never store again
    agent: {
      agentId,
      name,
      description,
      agentType,
      developerId: developerId,
      policy:      mergedPolicy,
      active:      true,
      createdAt:   now
    }
  };
}

/**
 * Validate agent credentials (agentId + raw secret).
 * Called by the token service during authentication.
 *
 * @returns {{ valid: boolean, agent?: object, error?: string }}
 */
export async function validateAgentCredentials(agentId, rawSecret) {
  if (!agentId)   return { valid: false, error: 'agentId is required' };
  if (!rawSecret) return { valid: false, error: 'agentSecret is required' };

  const db = getDatabase();

  const agent = await db.collection('agents').findOne({
    agentId,
    active: true
  });

  if (!agent) {
    return { valid: false, error: 'Agent not found or inactive' };
  }

  const secretMatch = await verifySecret(rawSecret, agent.secretHash);

  if (!secretMatch) {
    // Increment failed auth counter (for anomaly detection)
    await db.collection('agents').updateOne(
      { agentId },
      {
        $inc: { 'stats.failedAuths': 1 },
        $set: { updatedAt: new Date() }
      }
    );
    return { valid: false, error: 'Invalid agent secret' };
  }

  // Update last auth timestamp
  await db.collection('agents').updateOne(
    { agentId },
    {
      $set: { lastAuthAt: new Date(), updatedAt: new Date() },
      $inc: { 'stats.totalSessions': 1 }
    }
  );

  return { valid: true, agent };
}

/**
 * Retrieve an agent record by its agentId.
 * Strips the secretHash before returning.
 */
export async function getAgentById(agentId) {
  if (!agentId) throw new Error('agentId is required');

  const db    = getDatabase();
  const agent = await db.collection('agents').findOne({ agentId });

  if (!agent) throw new Error(`Agent '${agentId}' not found`);

  const { secretHash, ...safeAgent } = agent;
  return safeAgent;
}

/**
 * List all agents belonging to a developer.
 */
export async function getAgentsByDeveloper(developerId) {
  if (!developerId) throw new Error('developerId is required');

  const { ObjectId } = await import('mongodb');
  const db = getDatabase();

  let devObjectId;
  try {
    devObjectId = new ObjectId(developerId);
  } catch {
    throw new Error('Invalid developerId format');
  }

  const agents = await db.collection('agents')
    .find({ developerId: devObjectId })
    .project({ secretHash: 0 })   // never return the hash
    .sort({ createdAt: -1 })
    .toArray();

  return agents;
}

/**
 * Update the policy for an existing agent.
 * Only the owning developer may update.
 */
export async function updateAgentPolicy(agentId, developerId, newPolicy) {
  if (!agentId)     throw new Error('agentId is required');
  if (!developerId) throw new Error('developerId is required');
  if (!newPolicy)   throw new Error('newPolicy is required');

  const { ObjectId } = await import('mongodb');
  const db = getDatabase();

  let devObjectId;
  try {
    devObjectId = new ObjectId(developerId);
  } catch {
    throw new Error('Invalid developerId format');
  }

  // Verify ownership
  const agent = await db.collection('agents').findOne({
    agentId,
    developerId: devObjectId
  });
  if (!agent) throw new Error('Agent not found or access denied');

  const mergedPolicy = {
    ...DEFAULT_POLICY,
    ...agent.policy,
    ...newPolicy,
    rateLimit: {
      ...DEFAULT_POLICY.rateLimit,
      ...agent.policy?.rateLimit,
      ...newPolicy.rateLimit
    }
  };

  const now = new Date();

  await db.collection('agents').updateOne(
    { agentId },
    { $set: { policy: mergedPolicy, updatedAt: now } }
  );

  // Rebuild policy rules in agent_policies collection
  await db.collection('agent_policies').updateOne(
    { agentId },
    {
      $set: {
        policies:  buildDefaultPolicyRules(mergedPolicy),
        updatedAt: now
      }
    },
    { upsert: true }
  );

  return mergedPolicy;
}

/**
 * Deactivate an agent (soft delete).
 * All active sessions should be revoked by the token service separately.
 */
export async function deactivateAgent(agentId, developerId) {
  if (!agentId)     throw new Error('agentId is required');
  if (!developerId) throw new Error('developerId is required');

  const { ObjectId } = await import('mongodb');
  const db = getDatabase();

  let devObjectId;
  try {
    devObjectId = new ObjectId(developerId);
  } catch {
    throw new Error('Invalid developerId format');
  }

  const agent = await db.collection('agents').findOne({
    agentId,
    developerId: devObjectId
  });
  if (!agent) throw new Error('Agent not found or access denied');

  await db.collection('agents').updateOne(
    { agentId },
    { $set: { active: false, deactivatedAt: new Date(), updatedAt: new Date() } }
  );

  // Revoke all active sessions immediately
  const revokeResult = await db.collection('agent_sessions').updateMany(
    { agentId, revoked: false },
    { $set: { revoked: true, revokedAt: new Date(), revokedReason: 'agent_deactivated' } }
  );

  console.log(`⛔ Agent deactivated: ${agentId} — ${revokeResult.modifiedCount} session(s) revoked`);

  return {
    agentId,
    deactivated:      true,
    sessionsRevoked:  revokeResult.modifiedCount
  };
}

/**
 * Rotate (regenerate) the agent secret.
 * Old secret is immediately invalidated. New secret returned RAW once.
 */
export async function rotateAgentSecret(agentId, developerId) {
  if (!agentId)     throw new Error('agentId is required');
  if (!developerId) throw new Error('developerId is required');

  const { ObjectId } = await import('mongodb');
  const db = getDatabase();

  let devObjectId;
  try {
    devObjectId = new ObjectId(developerId);
  } catch {
    throw new Error('Invalid developerId format');
  }

  const agent = await db.collection('agents').findOne({
    agentId,
    developerId: devObjectId,
    active: true
  });
  if (!agent) throw new Error('Agent not found or access denied');

  const newRawSecret = generateAgentSecret();
  const newHash      = await hashSecret(newRawSecret);
  const now          = new Date();

  await db.collection('agents').updateOne(
    { agentId },
    {
      $set: {
        secretHash:       newHash,
        secretRotatedAt:  now,
        updatedAt:        now
      },
      $inc: { 'stats.failedAuths': 0 }   // reset counter on rotation
    }
  );

  // Revoke all existing sessions (force re-auth with new secret)
  await db.collection('agent_sessions').updateMany(
    { agentId, revoked: false },
    { $set: { revoked: true, revokedAt: now, revokedReason: 'secret_rotated' } }
  );

  console.log(`🔄 Secret rotated for agent: ${agentId}`);

  return {
    agentId,
    agentSecret:  newRawSecret,  // RAW — show once
    rotatedAt:    now
  };
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Build explicit policy rule objects from a flat policy config.
 * These are stored in agent_policies for the Phase 4 policy engine.
 */
function buildDefaultPolicyRules(policy) {
  const rules = [];

  // Allow rules for each explicitly permitted tool
  for (const tool of (policy.allowedTools || [])) {
    rules.push({
      resource:  `tool:${tool}`,
      effect:    'allow',
      conditions: {
        projectIds:  policy.allowedProjects || [],
        operations:  policy.allowedOperations || ['read']
      }
    });
  }

  // Wildcard deny — default deny everything not explicitly allowed
  rules.push({
    resource:  'tool:*',
    effect:    'deny',
    conditions: {}
  });

  return rules;
}

/**
 * Export DEFAULT_POLICY so the token service and policy engine can reference it.
 */
export { DEFAULT_POLICY };
