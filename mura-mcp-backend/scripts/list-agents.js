#!/usr/bin/env node

// ============================================================
// CLI Script: List AI Agents for a Developer
// Zero Trust MCP — Phase 1
//
// Usage:
//   node scripts/list-agents.js
//   node scripts/list-agents.js --email dev@example.com
// ============================================================

import dotenv from 'dotenv';
import readline from 'node:readline';
import { connectToMongoDB, getDatabase } from '../src/config/database/connection.js';
import { getAgentsByDeveloper } from '../src/auth/agentAuth.js';

dotenv.config();

function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

function padEnd(str, len) {
  return String(str || '').padEnd(len).substring(0, len);
}

function formatDate(date) {
  if (!date) return 'Never';
  return new Date(date).toLocaleString();
}

async function main() {
  console.log('\n==============================================');
  console.log('  MCP Hub — List AI Agents');
  console.log('==============================================\n');

  try {
    await connectToMongoDB();
    const db = getDatabase();

    // Get email from CLI arg or prompt
    const emailArg   = process.argv.find((_, i) => process.argv[i - 1] === '--email');
    const devEmail   = emailArg || await prompt('Developer email: ');

    if (!devEmail.trim()) {
      console.error('❌ Email is required.');
      process.exit(1);
    }

    const developer = await db.collection('developers').findOne({
      email: devEmail.trim()
    });

    if (!developer) {
      console.error(`❌ Developer not found: ${devEmail.trim()}`);
      process.exit(1);
    }

    const agents = await getAgentsByDeveloper(developer._id.toString());

    if (agents.length === 0) {
      console.log(`No agents registered for ${developer.email}`);
      console.log('Run: node scripts/register-agent.js\n');
      process.exit(0);
    }

    console.log(`Developer: ${developer.name} (${developer.email})`);
    console.log(`Total agents: ${agents.length}\n`);

    // ── Table header ─────────────────────────────────────────
    const COL = { id: 24, name: 22, type: 14, status: 8, tools: 36, lastAuth: 20 };
    const hr  = '─'.repeat(Object.values(COL).reduce((a, b) => a + b + 3, 0));

    console.log(hr);
    console.log(
      `${padEnd('Agent ID',   COL.id)}  ` +
      `${padEnd('Name',       COL.name)}  ` +
      `${padEnd('Type',       COL.type)}  ` +
      `${padEnd('Status',     COL.status)}  ` +
      `${padEnd('Allowed Tools',COL.tools)}  ` +
      `${padEnd('Last Auth',  COL.lastAuth)}`
    );
    console.log(hr);

    for (const a of agents) {
      const status  = a.active ? '✅ Active' : '⛔ Off';
      const tools   = (a.policy?.allowedTools || []).join(', ') || '(none)';
      console.log(
        `${padEnd(a.agentId,   COL.id)}  ` +
        `${padEnd(a.name,      COL.name)}  ` +
        `${padEnd(a.agentType, COL.type)}  ` +
        `${padEnd(status,      COL.status)}  ` +
        `${padEnd(tools,       COL.tools)}  ` +
        `${padEnd(formatDate(a.lastAuthAt), COL.lastAuth)}`
      );

      // Show stats inline
      const s = a.stats || {};
      console.log(
        `${''.padEnd(COL.id + 2)}  ` +
        `Sessions: ${s.totalSessions || 0}  ` +
        `Tool calls: ${s.totalToolCalls || 0}  ` +
        `Failed auths: ${s.failedAuths || 0}  ` +
        `Projects: ${(a.policy?.allowedProjects || []).join(', ') || '(none)'}  ` +
        `Ops: ${(a.policy?.allowedOperations || ['read']).join(',')}`
      );
      console.log('');
    }

    console.log(hr);
    console.log('\nCommands:');
    console.log('  Register new agent:  node scripts/register-agent.js');
    console.log('  Revoke/deactivate:   node scripts/revoke-agent.js\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
