#!/usr/bin/env node

// API Key Management Script for MCP Hub
// Usage: node scripts/manage-api-keys.js <command> [options]

import { MongoClient } from 'mongodb';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// MongoDB connection
let db = null;
let client = null;

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) {
      throw new Error("MONGO_URL environment variable is required");
    }

    client = new MongoClient(mongoUrl);
    await client.connect();
    
    const dbName = process.env.DB_NAME || "mcphub";
    db = client.db(dbName);
    
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error.message);
    throw error;
  }
}

// Generate a new API key
function generateApiKey(prefix = 'mcphub') {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

// Create a new API key
async function createApiKey(name, description = '', expiresInDays = null) {
  try {
    const apiKey = generateApiKey();
    const apiKeysCollection = db.collection('api_keys');
    
    const keyDoc = {
      key: apiKey,
      name: name,
      description: description,
      userId: name,
      active: true,
      permissions: ['read', 'write', 'delete', 'admin', 'audit'], // Full access
      createdAt: new Date(),
      lastUsed: null,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null
    };
    
    await apiKeysCollection.insertOne(keyDoc);
    
    console.log('\n🔑 API Key Created Successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Name: ${name}`);
    console.log(`Description: ${description}`);
    console.log(`API Key: ${apiKey}`);
    console.log(`Permissions: Full Access (read, write, delete, admin, audit)`);
    console.log(`Created: ${keyDoc.createdAt.toISOString()}`);
    console.log(`Expires: ${keyDoc.expiresAt ? keyDoc.expiresAt.toISOString() : 'Never'}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n📋 Usage in VS Code settings.json:');
    console.log(`{
  "mcp.servers": {
    "mcphub": {
      "command": "node",
      "args": ["${process.cwd()}/server-secure.js"],
      "env": {
        "MCP_API_KEY": "${apiKey}"
      }
    }
  }
}`);
    console.log('\n📋 Usage in .env file:');
    console.log(`MCP_API_KEY=${apiKey}`);
    console.log('\n⚠️  IMPORTANT: Save this API key securely - it cannot be retrieved again!');
    
    return keyDoc;
  } catch (error) {
    console.error('❌ Error creating API key:', error);
    throw error;
  }
}

// List all API keys
async function listApiKeys() {
  try {
    const apiKeysCollection = db.collection('api_keys');
    const keys = await apiKeysCollection.find(
      { active: true },
      { 
        projection: { 
          key: 0 // Don't show the actual key, show everything else
        }
      }
    ).toArray();
    
    if (keys.length === 0) {
      console.log('\n📝 No active API keys found.');
      return;
    }
    
    console.log('\n🔑 Active API Keys:');
    console.log('═══════════════════════════════════════════════════════');
    
    keys.forEach((key, index) => {
      console.log(`${index + 1}. ${key.name}`);
      console.log(`   Description: ${key.description || 'No description'}`);
      console.log(`   User ID: ${key.userId}`);
      console.log(`   Permissions: ${key.permissions.join(', ')}`);
      console.log(`   Created: ${key.createdAt.toISOString()}`);
      console.log(`   Last Used: ${key.lastUsed ? key.lastUsed.toISOString() : 'Never'}`);
      console.log(`   Expires: ${key.expiresAt ? key.expiresAt.toISOString() : 'Never'}`);
      console.log('');
    });
    
    return keys;
  } catch (error) {
    console.error('❌ Error listing API keys:', error);
    throw error;
  }
}

// Deactivate an API key
async function deactivateApiKey(name) {
  try {
    const apiKeysCollection = db.collection('api_keys');
    const result = await apiKeysCollection.updateOne(
      { name: name, active: true },
      { $set: { active: false, deactivatedAt: new Date() } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`✅ API key '${name}' has been deactivated.`);
    } else {
      console.log(`❌ API key '${name}' not found or already deactivated.`);
    }
    
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('❌ Error deactivating API key:', error);
    throw error;
  }
}

// Show usage information
function showUsage() {
  console.log(`
🔑 MCP Hub API Key Management

USAGE:
  node scripts/manage-api-keys.js <command> [options]

COMMANDS:
  create <name> [description] [expiry_days]  Create a new API key
  list                                       List all active API keys  
  deactivate <name>                         Deactivate an API key
  help                                      Show this help message

EXAMPLES:
  # Create API key for John Developer
  node scripts/manage-api-keys.js create "john-developer" "Johns development key"
  
  # Create API key that expires in 90 days
  node scripts/manage-api-keys.js create "temp-key" "Temporary access" 90
  
  # List all API keys
  node scripts/manage-api-keys.js list
  
  # Deactivate an API key
  node scripts/manage-api-keys.js deactivate "john-developer"

ENVIRONMENT VARIABLES:
  MONGO_URL    MongoDB connection string (required)
  DB_NAME      Database name (default: mcphub)
`);
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help') {
    showUsage();
    return;
  }
  
  const command = args[0];
  
  try {
    await connectToMongoDB();
    
    switch (command) {
      case 'create':
        if (args.length < 2) {
          console.error('❌ Error: Name is required for create command');
          showUsage();
          return;
        }
        const name = args[1];
        const description = args[2] || '';
        const expiresInDays = args[3] ? parseInt(args[3]) : null;
        await createApiKey(name, description, expiresInDays);
        break;
        
      case 'list':
        await listApiKeys();
        break;
        
      case 'deactivate':
        if (args.length < 2) {
          console.error('❌ Error: Name is required for deactivate command');
          showUsage();
          return;
        }
        await deactivateApiKey(args[1]);
        break;
        
      default:
        console.error(`❌ Error: Unknown command '${command}'`);
        showUsage();
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run the script
main().catch(console.error);