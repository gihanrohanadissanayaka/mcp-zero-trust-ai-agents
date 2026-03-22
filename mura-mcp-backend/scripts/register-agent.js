#!/usr/bin/env node

// ============================================================
// CLI Script: Register a new AI Agent
// Zero Trust MCP — Phase 1
//
// Usage:
//   node scripts/register-agent.js
//
// Requires env vars:
//   MONGO_URL    — MongoDB connection string
//   DB_NAME      — Database name (default: mcphub)
// ============================================================

import dotenv from 'dotenv';
import readline from 'node:readline';
import { connectToMongoDB, getDatabase } from '../src/config/database/connection.js';
import { registerAgent } from '../src/auth/agentAuth.js';

dotenv.config();

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function promptSelect(question, options) {
  const optionList = options.map((o, i) => `  [${i + 1}] ${o}`).join('\n');
  return (async () => {
    while (true) {
      console.log(question);
      console.log(optionList);
      const input = await prompt('Enter number: ');
      const idx   = Number.parseInt(input, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        return options[idx];
      }
      console.log('❌ Invalid choice, try again.\n');
    }
  })();
}

async function main() {
  console.log('\n==============================================');
  console.log('  MCP Hub — Register New AI Agent');
  console.log('  Zero Trust Identity Setup');
  console.log('==============================================\n');

  try {
    await connectToMongoDB();
    const db = getDatabase();

    // ── Step 1: Find the developer ──────────────────────────
    const devEmail = await prompt('Developer email (your registered account): ');
    if (!devEmail.trim()) {
      console.error('❌ Email is required.');
      process.exit(1);
    }

    const developer = await db.collection('developers').findOne({
      email: devEmail.trim()
    });

    if (!developer) {
      console.error(`❌ No developer found with email: ${devEmail.trim()}`);
      console.error('   Register first with: npm run setup:developer');
      process.exit(1);
    }

    console.log(`\n✅ Developer found: ${developer.name} (${developer.email})`);

    // ── Step 2: Agent details ────────────────────────────────
    const name = await prompt('\nAgent name (e.g. "Claude Dev Assistant"): ');
    if (!name.trim()) {
      console.error('❌ Agent name is required.');
      process.exit(1);
    }

    const description = await prompt('Description (optional, press Enter to skip): ');

    const agentType = await promptSelect(
      '\nAgent type:',
      ['ai_assistant', 'automation', 'ci_bot', 'data_pipeline', 'custom']
    );

    // ── Step 3: Permission policy ────────────────────────────
    console.log('\n--- Permission Policy ---');
    console.log('Available tools:');
    console.log('  usecases_search, usecases_get, usecases_upsert');
    console.log('  analysis_impact, scaffold_create');
    console.log('  feature_request_automation, usecase_sync_automation');
    console.log('  (Leave blank to deny all tools — you can update later)\n');

    const toolsInput = await prompt('Allowed tools (comma-separated, or * for all): ');
    let allowedTools = [];
    if (toolsInput.trim() === '*') {
      allowedTools = [
        'usecases_search',
        'usecases_get',
        'usecases_upsert',
        'analysis_impact',
        'scaffold_create',
        'feature_request_automation',
        'usecase_sync_automation'
      ];
    } else if (toolsInput.trim()) {
      allowedTools = toolsInput.split(',').map(t => t.trim()).filter(Boolean);
    }

    const projectsInput = await prompt('Allowed project IDs (comma-separated, or * for all, or Enter for none): ');
    let allowedProjects = [];
    if (projectsInput.trim() === '*') {
      allowedProjects = ['*'];
    } else if (projectsInput.trim()) {
      allowedProjects = projectsInput.split(',').map(p => p.trim()).filter(Boolean);
    }

    const operations = await promptSelect(
      '\nAllowed operations:',
      ['read', 'read,write', 'read,write,admin']
    );
    const allowedOperations = operations.split(',');

    const sessionMinsInput = await prompt('\nMax session duration in minutes (default: 30, max: 480): ');
    const maxSessionDurationMinutes = Number.parseInt(sessionMinsInput, 10) || 30;

    // ── Step 4: Confirm ──────────────────────────────────────
    console.log('\n--- Summary ---');
    console.log(`Name:          ${name.trim()}`);
    console.log(`Type:          ${agentType}`);
    console.log(`Description:   ${description.trim() || '(none)'}`);
    console.log(`Tools:         ${allowedTools.length ? allowedTools.join(', ') : '(none — all denied)'}`);
    console.log(`Projects:      ${allowedProjects.length ? allowedProjects.join(', ') : '(none)'}`);
    console.log(`Operations:    ${allowedOperations.join(', ')}`);
    console.log(`Session limit: ${maxSessionDurationMinutes} minutes`);

    const confirm = await prompt('\nProceed? (yes/no): ');
    if (confirm.trim().toLowerCase() !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }

    // ── Step 5: Register ─────────────────────────────────────
    const result = await registerAgent({
      developerId: developer._id.toString(),
      name:        name.trim(),
      description: description.trim() || '',
      agentType,
      policy: {
        allowedTools,
        allowedProjects,
        allowedOperations,
        maxSessionDurationMinutes
      }
    });

    // ── Step 6: Display credentials ──────────────────────────
    console.log('\n==============================================');
    console.log('✅ Agent registered successfully!');
    console.log('==============================================');
    console.log('\n⚠️  IMPORTANT: Save these credentials now.');
    console.log('   The agentSecret will NEVER be shown again.\n');
    console.log(`Agent ID:      ${result.agentId}`);
    console.log(`Agent Secret:  ${result.agentSecret}`);
    console.log('\n--- Add to your MCP client config ---');
    console.log(JSON.stringify({
      env: {
        MCP_AGENT_ID:     result.agentId,
        MCP_AGENT_SECRET: result.agentSecret
      }
    }, null, 2));
    console.log('\n----------------------------------------------\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();
