#!/usr/bin/env node

/**
 * Refresh API Key Script
 * Allows developers to generate a new API key
 */

import { connectToDatabase } from '../src/config/database/connection.js';
import { generateApiKey } from '../src/controllers/authController.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function refreshApiKey() {
  console.log('\n🔄 Refresh API Key');
  console.log('==================\n');
  
  try {
    const db = await connectToDatabase();
    
    // Get developer email
    const email = await question('📧 Enter your email: ');
    
    // Find developer
    const developer = await db.collection('developers').findOne({ 
      email: email.trim() 
    });
    
    if (!developer) {
      console.log('❌ Developer not found. Please register first.');
      return;
    }
    
    // Find existing API key
    const existingKey = await db.collection('api_keys').findOne({
      developerId: developer._id,
      active: true
    });
    
    if (!existingKey) {
      console.log('❌ No active API key found');
      return;
    }
    
    console.log(`\n🔍 Current API Key: ${existingKey.key.substring(0, 20)}...`);
    console.log(`📅 Created: ${existingKey.createdAt?.toISOString().split('T')[0]}`);
    console.log(`🕒 Last Used: ${existingKey.lastUsed?.toISOString().split('T')[0] || 'Never'}\n`);
    
    const confirm = await question('⚠️  Are you sure you want to generate a new API key? This will invalidate the current one. (y/n): ');
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      return;
    }
    
    // Generate new API key
    const newApiKey = generateApiKey('mcphub');
    
    // Deactivate old key
    await db.collection('api_keys').updateOne(
      { _id: existingKey._id },
      { $set: { active: false, deactivatedAt: new Date() } }
    );
    
    // Create new key record
    const newKeyRecord = {
      key: newApiKey,
      developerId: developer._id,
      email: developer.email,
      name: `${developer.name} - Refreshed Key`,
      description: 'Refreshed API key for developer access',
      permissions: existingKey.permissions || ['read', 'write'],
      active: true,
      createdAt: new Date(),
      lastUsed: null,
      expiresAt: null
    };
    
    await db.collection('api_keys').insertOne(newKeyRecord);
    
    console.log('\n✅ API Key refreshed successfully!');
    console.log(`🔑 New API Key: ${newApiKey}\n`);
    
    console.log('📋 Update your MCP configuration:');
    console.log('==================================');
    console.log(JSON.stringify({
      "env": {
        "MCP_API_KEY": newApiKey
      }
    }, null, 2));
    console.log('==================================\n');
    
    console.log('📝 Next Steps:');
    console.log('1. Update your Claude Desktop MCP configuration with the new key');
    console.log('2. Restart Claude Desktop');
    console.log('3. The old key is now deactivated\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshApiKey().catch(console.error);
}