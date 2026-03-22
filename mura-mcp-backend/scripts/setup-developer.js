#!/usr/bin/env node

/**
 * Developer Setup Script
 * Helps developers register and configure their MCP client with their unique API key
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerDeveloperService } from '../src/controllers/authController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function setupDeveloper() {
  console.log('\n🚀 MCP Hub Developer Setup');
  console.log('=====================================\n');
  
  try {
    // Collect developer information
    console.log('📋 Please provide your information:\n');
    
    const name = await question('👤 Full Name: ');
    const email = await question('📧 Email: ');
    const password = await question('🔒 Password: ');
    const company = await question('🏢 Company (optional): ');
    
    console.log('\n🔄 Registering developer...');
    
    // Register developer
    const result = await registerDeveloperService({
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      company: company.trim()
    });
    
    console.log('\n✅ Registration successful!');
    console.log(`👤 Developer: ${result.developer.name}`);
    console.log(`📧 Email: ${result.developer.email}`);
    console.log(`🔑 API Key: ${result.apiKey}\n`);
    
    // Generate MCP configuration
    const mcpConfig = generateMCPConfig(result.apiKey);
    
    console.log('📁 MCP Client Configuration:');
    console.log('=====================================');
    console.log(JSON.stringify(mcpConfig, null, 2));
    console.log('=====================================\n');
    
    // Ask if they want to save the config
    const saveConfig = await question('💾 Save this configuration to mcp-config.json? (y/n): ');
    
    if (saveConfig.toLowerCase() === 'y' || saveConfig.toLowerCase() === 'yes') {
      const configPath = path.join(process.cwd(), 'mcp-config.json');
      fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2));
      console.log(`✅ Configuration saved to: ${configPath}\n`);
    }
    
    console.log('🎉 Setup Complete!');
    console.log('\n📝 Next Steps:');
    console.log('1. Copy the MCP configuration to your Claude Desktop settings');
    console.log('2. Restart Claude Desktop');
    console.log('3. Start using MCP Hub tools!\n');
    
    console.log('🔧 Admin Commands:');
    console.log('- View your keys: npm run keys:list');
    console.log('- Refresh your key: npm run keys:refresh');
    console.log('- Deactivate your key: npm run keys:deactivate\n');
    
  } catch (error) {
    console.error('❌ Registration failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

function generateMCPConfig(apiKey) {
  return {
    "servers": {
      "mcp-hub": {
        "command": process.execPath, // Current Node.js path
        "args": ["server.js"],
        "cwd": process.cwd(),
        "env": {
          "MCP_API_KEY": apiKey
        }
      }
    }
  };
}

// Run the setup
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDeveloper().catch(console.error);
}

export { setupDeveloper };