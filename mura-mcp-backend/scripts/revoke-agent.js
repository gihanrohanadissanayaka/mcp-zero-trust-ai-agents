#!/usr/bin/env node

// ============================================================
// CLI Script: Revoke / Deactivate an AI Agent
// Zero Trust MCP — Phase 1
//
// Operations:
//   1. Revoke all sessions     (agent stays registered, just kicked out)
//   2. Deactivate agent        (soft-delete, all sessions revoked)
//   3. Rotate agent secret     (invalidates sessions, issues new secret)
//
// Usage:
//   node scripts/revoke-agent.js
// ============================================================

import dotenv from 'dotenv';
import readline from 'node:readline';
import { connectToMongoDB, getDatabase } from '../src/config/database/connection.js';
import {
  getAgentsByDeveloper,
  deactivateAgent,
  rotateAgentSecret
} from '../src/auth/agentAuth.js';

dotenv.config();

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('\n==============================================');
  console.log('  MCP Hub — Agent Revocation / Deactivation');
  console.log('==============================================\n');

  try {
    await connectToMongoDB();
    const db = getDatabase();

    // ── Step 1: Identify developer ───────────────────────────
    const devEmail = await prompt('Developer email: ');
    const developer = await db.collection('developers').findOne({
      email: devEmail.trim()
    });

    if (!developer) {
      console.error(`❌ Developer not found: ${devEmail.trim()}`);
      process.exit(1);
    }

    // ── Step 2: List agents ──────────────────────────────────
    const agents = await getAgentsByDeveloper(developer._id.toString());

    if (agents.length === 0) {
      console.log('No agents found for this developer.');
      process.exit(0);
    }

    console.log(`\nAgents for ${developer.email}:\n`);
    agents.forEach((a, i) => {
      const status = a.active ? '✅ Active' : '⛔ Inactive';
      console.log(`  [${i + 1}] ${a.agentId}  ${a.name}  (${a.agentType})  ${status}`);
    });

    // ── Step 3: Select target agent ──────────────────────────
    const agentChoice = await prompt('\nEnter agent number to act on: ');
    const agentIdx    = Number.parseInt(agentChoice, 10) - 1;

    if (agentIdx < 0 || agentIdx >= agents.length) {
      console.error('❌ Invalid choice.');
      process.exit(1);
    }

    const selectedAgent = agents[agentIdx];
    console.log(`\nSelected: ${selectedAgent.name} (${selectedAgent.agentId})`);

    // ── Step 4: Choose action ────────────────────────────────
    console.log('\nActions:');
    console.log('  [1] Revoke all active sessions  (agent stays registered)');
    console.log('  [2] Rotate agent secret         (all sessions killed, new secret issued)');
    console.log('  [3] Deactivate agent             ⚠️  PERMANENT soft-delete');

    const actionChoice = await prompt('\nChoose action: ');

    switch (actionChoice.trim()) {

      // ── Revoke sessions only ──────────────────────────────
      case '1': {
        const count = await db.collection('agent_sessions').updateMany(
          { agentId: selectedAgent.agentId, revoked: false },
          {
            $set: {
              revoked:       true,
              revokedAt:     new Date(),
              revokedReason: 'manual_cli_revocation'
            }
          }
        );
        console.log(`\n✅ ${count.modifiedCount} session(s) revoked for agent ${selectedAgent.agentId}.`);
        console.log('   Agent remains registered and can re-authenticate.\n');
        break;
      }

      // ── Rotate secret ─────────────────────────────────────
      case '2': {
        const confirm = await prompt('\n⚠️  This will invalidate all active sessions. Proceed? (yes/no): ');
        if (confirm.trim().toLowerCase() !== 'yes') {
          console.log('Aborted.');
          break;
        }

        const result = await rotateAgentSecret(
          selectedAgent.agentId,
          developer._id.toString()
        );

        console.log('\n==============================================');
        console.log('✅ Secret rotated successfully!');
        console.log('==============================================');
        console.log('\n⚠️  Save the new secret — it will NOT be shown again.\n');
        console.log(`Agent ID:      ${result.agentId}`);
        console.log(`New Secret:    ${result.agentSecret}`);
        console.log(`Rotated at:    ${result.rotatedAt.toISOString()}\n`);
        break;
      }

      // ── Deactivate (soft-delete) ───────────────────────────
      case '3': {
        const confirm = await prompt(
          `\n⚠️  PERMANENT: Deactivate agent "${selectedAgent.name}"? (yes/no): `
        );
        if (confirm.trim().toLowerCase() !== 'yes') {
          console.log('Aborted.');
          break;
        }

        const result = await deactivateAgent(
          selectedAgent.agentId,
          developer._id.toString()
        );

        console.log(`\n⛔ Agent deactivated: ${result.agentId}`);
        console.log(`   Sessions revoked:   ${result.sessionsRevoked}`);
        console.log('   The agent can no longer authenticate.\n');
        break;
      }

      default: {
        console.log('❌ Invalid action choice. Exiting.');
        break;
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();
