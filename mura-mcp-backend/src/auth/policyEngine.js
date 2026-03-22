#!/usr/bin/env node

// ============================================================
// Policy Engine
// Zero Trust MCP — Phase 4
//
// Evaluates whether an agent action should be allowed or denied
// based on structured policy rules stored in agent_policies.
//
// Design principles:
//   • Default DENY — if no rule matches, access is denied
//   • First-match-wins — rules are evaluated top-down
//   • Explicit DENY beats ALLOW at same position
//   • Wildcard support — tool:* matches all tools
//   • Condition-based rules — projectIds, operations, timeWindow
//   • DB-authoritative — always reads live rules, not just JWT claims
//     (catches policy changes that happened after token was issued)
//
// Rule schema (stored in agent_policies.policies[]):
// {
//   id:        string,        unique rule identifier (auto-generated)
//   resource:  string,        'tool:<name>' | 'tool:*' | 'project:<id>'
//   effect:    'allow'|'deny'
//   conditions: {
//     projectIds?:    string[],   allowed project IDs, [] = any
//     operations?:    string[],   ['read','write','admin']
//     timeWindow?: {
//       startHour: number,         0-23 UTC
//       endHour:   number,         0-23 UTC
//       daysOfWeek: number[]       0=Sun … 6=Sat
//     }
//   },
//   description?: string,          human-readable rule purpose
//   createdAt:  Date,
//   updatedAt:  Date
// }
// ============================================================

import crypto from 'node:crypto';
import { getDatabase } from '../config/database/connection.js';

// ============================================================
// RULE MATCHING
// ============================================================

/**
 * Determine whether a policy rule's resource pattern matches the tool being called.
 *
 * Supported patterns:
 *   'tool:usecases_search'  → exact match
 *   'tool:*'               → any tool
 *   'tool:usecases_*'      → prefix wildcard (future)
 */
function matchesResource(ruleResource, toolName) {
  if (ruleResource === 'tool:*') return true;

  if (ruleResource.endsWith(':*')) {
    // e.g. 'tool:usecases_*' matches 'tool:usecases_search'
    const prefix = ruleResource.slice(0, -1); // 'tool:usecases_'
    return `tool:${toolName}`.startsWith(prefix);
  }

  return ruleResource === `tool:${toolName}`;
}

/**
 * Evaluate all conditions attached to a rule.
 * ALL conditions must pass for the rule to match (AND semantics).
 */
function matchesConditions(conditions, context) {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  // ── Project scope condition ──────────────────────────────
  if (conditions.projectIds?.length > 0) {
    const requested = context.projectId ?? null;

    // No project ID in the call — only allow if rule has wildcard
    if (!requested) {
      if (!conditions.projectIds.includes('*')) return false;
    } else if (
      !conditions.projectIds.includes('*') &&
      !conditions.projectIds.includes(requested)
    ) {
      return false;
    }
  }

  // ── Operation condition ──────────────────────────────────
  if (conditions.operations?.length > 0) {
    if (!conditions.operations.includes(context.operation)) {
      // 'admin' satisfies any required operation
      if (context.operation !== 'admin') return false;
    }
  }

  // ── Time window condition ────────────────────────────────
  if (conditions.timeWindow) {
    const now        = new Date();
    const hourUTC    = now.getUTCHours();
    const dayOfWeek  = now.getUTCDay();
    const { startHour, endHour, daysOfWeek } = conditions.timeWindow;

    if (daysOfWeek?.length > 0 && !daysOfWeek.includes(dayOfWeek)) return false;

    if (startHour !== undefined && endHour !== undefined) {
      // Handle overnight windows e.g. 22–06
      const inWindow = startHour <= endHour
        ? hourUTC >= startHour && hourUTC < endHour
        : hourUTC >= startHour || hourUTC < endHour;

      if (!inWindow) return false;
    }
  }

  return true;
}

// ============================================================
// CORE EVALUATION
// ============================================================

/**
 * Evaluate policy rules for an agent + tool + context.
 *
 * @param {string} agentId
 * @param {string} toolName
 * @param {object} context
 * @param {string|null} context.projectId   - project being accessed (may be null)
 * @param {string}      context.operation   - 'read' | 'write' | 'admin'
 *
 * @returns {{
 *   decision:     'allow' | 'deny',
 *   matchedRule?: object,
 *   reason:       string
 * }}
 */
export async function evaluatePolicy(agentId, toolName, context) {
  if (!agentId)  return { decision: 'deny', reason: 'missing_agent_id' };
  if (!toolName) return { decision: 'deny', reason: 'missing_tool_name' };

  const db = getDatabase();
  const policyDoc = await db.collection('agent_policies').findOne({ agentId });

  if (!policyDoc || !Array.isArray(policyDoc.policies) || policyDoc.policies.length === 0) {
    return {
      decision: 'deny',
      reason:   'no_policies_defined',
      hint:     'Use PATCH /api/agents/:agentId/policy to configure permissions'
    };
  }

  // Evaluate rules top-down — first match wins
  for (const rule of policyDoc.policies) {
    if (!matchesResource(rule.resource, toolName)) continue;
    if (!matchesConditions(rule.conditions ?? {}, context)) continue;

    return {
      decision:    rule.effect,   // 'allow' or 'deny'
      matchedRule: {
        id:          rule.id,
        resource:    rule.resource,
        effect:      rule.effect,
        description: rule.description ?? null
      },
      reason: `matched_rule:${rule.id ?? rule.resource}`
    };
  }

  // Default: deny anything that didn't match
  return {
    decision: 'deny',
    reason:   'no_matching_rule_default_deny'
  };
}

// ============================================================
// POLICY MANAGEMENT
// ============================================================

/**
 * Build a complete policy document from a flat agent policy config.
 * Used during agent registration and policy updates.
 *
 * @param {object} policyConfig  - { allowedTools, allowedProjects, allowedOperations }
 * @returns {object[]}            - ordered rules array
 */
export function buildPolicyRules(policyConfig) {
  const rules  = [];
  const tools  = policyConfig.allowedTools      ?? [];
  const projs  = policyConfig.allowedProjects   ?? [];
  const ops    = policyConfig.allowedOperations ?? ['read'];
  const now    = new Date();

  // Explicit ALLOW rules for each permitted tool
  for (const tool of tools) {
    rules.push({
      id:          `rule_${crypto.randomBytes(6).toString('hex')}`,
      resource:    `tool:${tool}`,
      effect:      'allow',
      conditions:  {
        projectIds: projs,
        operations: ops
      },
      description: `Auto-generated: allow ${tool} for ${ops.join(',')} on ${projs.length ? projs.join(',') : 'any project'}`,
      createdAt:   now,
      updatedAt:   now
    });
  }

  // Catch-all DENY — default fail-closed
  rules.push({
    id:          `rule_${crypto.randomBytes(6).toString('hex')}`,
    resource:    'tool:*',
    effect:      'deny',
    conditions:  {},
    description: 'Default deny — catch-all, never remove',
    createdAt:   now,
    updatedAt:   now
  });

  return rules;
}

/**
 * Append a single custom rule to an agent's policy.
 * Rule is inserted before the catch-all deny at the end.
 *
 * @param {string} agentId
 * @param {object} rule  - { resource, effect, conditions, description }
 * @returns {object}       - the created rule with generated id
 */
export async function addPolicyRule(agentId, rule) {
  if (!agentId)      throw new Error('agentId is required');
  if (!rule.resource) throw new Error('rule.resource is required');
  if (!['allow', 'deny'].includes(rule.effect)) {
    throw new Error("rule.effect must be 'allow' or 'deny'");
  }

  const db  = getDatabase();
  const now = new Date();

  const newRule = {
    id:          `rule_${crypto.randomBytes(6).toString('hex')}`,
    resource:    rule.resource,
    effect:      rule.effect,
    conditions:  rule.conditions ?? {},
    description: rule.description ?? '',
    createdAt:   now,
    updatedAt:   now
  };

  // Insert before the last rule (which should always be the catch-all deny)
  const policyDoc = await db.collection('agent_policies').findOne({ agentId });
  if (!policyDoc) throw new Error(`No policy document found for agent '${agentId}'`);

  const policies = policyDoc.policies ?? [];

  // Find insertion point: before the last tool:* deny rule
  const catchAllIdx = policies.findLastIndex(
    r => r.resource === 'tool:*' && r.effect === 'deny'
  );

  const insertAt = catchAllIdx >= 0 ? catchAllIdx : policies.length;
  policies.splice(insertAt, 0, newRule);

  await db.collection('agent_policies').updateOne(
    { agentId },
    { $set: { policies, updatedAt: now } }
  );

  return newRule;
}

/**
 * Remove a rule by its id from an agent's policy.
 * The catch-all deny rule cannot be removed.
 */
export async function removePolicyRule(agentId, ruleId) {
  if (!agentId) throw new Error('agentId is required');
  if (!ruleId)  throw new Error('ruleId is required');

  const db         = getDatabase();
  const policyDoc  = await db.collection('agent_policies').findOne({ agentId });
  if (!policyDoc)  throw new Error(`No policy document found for agent '${agentId}'`);

  const rule = (policyDoc.policies ?? []).find(r => r.id === ruleId);
  if (!rule) throw new Error(`Rule '${ruleId}' not found`);

  if (rule.resource === 'tool:*' && rule.effect === 'deny') {
    throw new Error('Cannot remove the default catch-all deny rule');
  }

  const updated = policyDoc.policies.filter(r => r.id !== ruleId);

  await db.collection('agent_policies').updateOne(
    { agentId },
    { $set: { policies: updated, updatedAt: new Date() } }
  );

  return { removed: true, ruleId };
}

/**
 * Replace the entire policy rule set for an agent.
 * Always appends a catch-all deny if not explicitly provided.
 */
export async function replacePolicyRules(agentId, rules) {
  if (!agentId) throw new Error('agentId is required');
  if (!Array.isArray(rules)) throw new Error('rules must be an array');

  const now = new Date();

  // Validate all rules
  for (const r of rules) {
    if (!r.resource) throw new Error('Each rule must have a resource field');
    if (!['allow', 'deny'].includes(r.effect)) {
      throw new Error("Each rule effect must be 'allow' or 'deny'");
    }
  }

  // Ensure catch-all deny exists at the end
  const hasCatchAll = rules.some(r => r.resource === 'tool:*' && r.effect === 'deny');
  const normalised  = rules.map(r => ({
    id:          r.id ?? `rule_${crypto.randomBytes(6).toString('hex')}`,
    resource:    r.resource,
    effect:      r.effect,
    conditions:  r.conditions ?? {},
    description: r.description ?? '',
    createdAt:   r.createdAt ?? now,
    updatedAt:   now
  }));

  if (!hasCatchAll) {
    normalised.push({
      id:          `rule_${crypto.randomBytes(6).toString('hex')}`,
      resource:    'tool:*',
      effect:      'deny',
      conditions:  {},
      description: 'Default deny — catch-all, never remove',
      createdAt:   now,
      updatedAt:   now
    });
  }

  const db = getDatabase();
  await db.collection('agent_policies').updateOne(
    { agentId },
    { $set: { policies: normalised, updatedAt: now } },
    { upsert: true }
  );

  return normalised;
}

/**
 * Retrieve the full policy document for an agent.
 */
export async function getPolicyDocument(agentId) {
  if (!agentId) throw new Error('agentId is required');

  const db        = getDatabase();
  const policyDoc = await db.collection('agent_policies').findOne({ agentId });

  if (!policyDoc) {
    throw new Error(`No policy document found for agent '${agentId}'`);
  }

  return policyDoc;
}

/**
 * Simulate a policy decision without actually performing the tool call.
 * Useful for testing/debugging policy rules.
 */
export async function simulatePolicy(agentId, toolName, context) {
  const result = await evaluatePolicy(agentId, toolName, context);

  const db        = getDatabase();
  const policyDoc = await db.collection('agent_policies').findOne({ agentId });

  return {
    simulation:    true,
    agentId,
    toolName,
    context,
    decision:      result.decision,
    matchedRule:   result.matchedRule ?? null,
    reason:        result.reason,
    allRules:      policyDoc?.policies ?? [],
    evaluatedAt:   new Date()
  };
}
