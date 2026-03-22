#!/usr/bin/env node

/**
 * Deactivate API Key Script
 * Allows developers to deactivate their API keys
 */

import { connectToDatabase } from '../src/config/database/connection.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function deactivateApiKey() {
  console.log('\n🚫 Deactivate API Key');
  console.log('=====================\n');
  
  try {
    const db = await connectToDatabase();
    
    // Get developer email
    const email = await question('📧 Enter your email: ');
    
    // Find developer
    const developer = await db.collection('developers').findOne({ 
      email: email.trim() 
    });
    
    if (!developer) {
      console.log('❌ Developer not found');
      return;
    }
    
    // Find active API keys
    const activeKeys = await db.collection('api_keys').find({
      developerId: developer._id,
      active: true
    }).toArray();
    
    if (activeKeys.length === 0) {
      console.log('❌ No active API keys found');
      return;
    }
    
    console.log(`\n📋 Found ${activeKeys.length} active API key(s):\n`);
    
    activeKeys.forEach((key, index) => {
      console.log(`${index + 1}. 🔑 ${key.key.substring(0, 20)}...`);
      console.log(`   📝 ${key.description}`);
      console.log(`   📅 Created: ${key.createdAt?.toISOString().split('T')[0]}`);
      console.log(`   🕒 Last Used: ${key.lastUsed?.toISOString().split('T')[0] || 'Never'}\n`);
    });
    
    const keyIndex = await question('🔢 Enter the number of the key to deactivate (or "all" for all keys): ');
    
    if (keyIndex.toLowerCase() === 'all') {
      const confirm = await question('⚠️  Are you sure you want to deactivate ALL your API keys? (y/n): ');
      
      if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        console.log('❌ Operation cancelled');
        return;
      }
      
      // Deactivate all keys
      const result = await db.collection('api_keys').updateMany(
        { developerId: developer._id, active: true },
        { $set: { active: false, deactivatedAt: new Date() } }
      );
      
      console.log(`\n✅ Deactivated ${result.modifiedCount} API key(s)`);
      
    } else {
      const index = parseInt(keyIndex) - 1;
      
      if (index < 0 || index >= activeKeys.length) {
        console.log('❌ Invalid selection');
        return;
      }
      
      const selectedKey = activeKeys[index];
      
      const confirm = await question(`⚠️  Are you sure you want to deactivate key ${selectedKey.key.substring(0, 20)}...? (y/n): `);
      
      if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        console.log('❌ Operation cancelled');
        return;
      }
      
      // Deactivate selected key
      await db.collection('api_keys').updateOne(
        { _id: selectedKey._id },
        { $set: { active: false, deactivatedAt: new Date() } }
      );
      
      console.log(`\n✅ API key deactivated: ${selectedKey.key.substring(0, 20)}...`);
    }
    
    console.log('\n📝 Note: Deactivated keys cannot be reactivated. You can generate a new key with:');
    console.log('npm run keys:refresh\n');
    
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
  deactivateApiKey().catch(console.error);
}