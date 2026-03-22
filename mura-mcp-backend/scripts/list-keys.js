#!/usr/bin/env node

/**
 * List API Keys Script
 * Shows all API keys for developers (admin only) or current developer's keys
 */

import { connectToDatabase } from '../src/config/database/connection.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function listApiKeys() {
  console.log('\n🔑 API Key Management');
  console.log('====================\n');
  
  try {
    const db = await connectToDatabase();
    
    // Ask for email to filter keys
    const email = await question('📧 Enter your email (or "admin" for all keys): ');
    
    let query = {};
    if (email.trim().toLowerCase() !== 'admin') {
      query.email = email.trim();
    }
    
    const apiKeys = await db.collection('api_keys').find(query).toArray();
    const developers = await db.collection('developers').find({}).toArray();
    
    if (apiKeys.length === 0) {
      console.log('❌ No API keys found');
      return;
    }
    
    console.log(`\n📋 Found ${apiKeys.length} API key(s):\n`);
    
    apiKeys.forEach((key, index) => {
      const developer = developers.find(dev => dev._id.toString() === key.developerId.toString());
      
      console.log(`${index + 1}. 🔑 ${key.key.substring(0, 20)}...`);
      console.log(`   👤 Developer: ${developer?.name || 'Unknown'}`);
      console.log(`   📧 Email: ${key.email}`);
      console.log(`   📝 Description: ${key.description}`);
      console.log(`   ✅ Active: ${key.active ? 'Yes' : 'No'}`);
      console.log(`   📅 Created: ${key.createdAt?.toISOString().split('T')[0] || 'Unknown'}`);
      console.log(`   🕒 Last Used: ${key.lastUsed?.toISOString().split('T')[0] || 'Never'}`);
      console.log(`   🔒 Permissions: ${key.permissions?.join(', ') || 'None'}\n`);
    });
    
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
  listApiKeys().catch(console.error);
}