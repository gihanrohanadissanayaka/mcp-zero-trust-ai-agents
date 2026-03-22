#!/usr/bin/env node

// Security Setup Script for MCP Hub
// Generates secure configuration and sets up initial security

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

console.log('🔐 Setting up MCP Hub Security...\n');

// Generate cryptographically secure keys
function generateSecureKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generateApiKey() {
  const prefix = 'mcphub';
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Generate secure configuration
const secureConfig = {
  MCP_API_KEY: generateApiKey(),
  MCP_ADMIN_KEY: generateApiKey(),
  JWT_SECRET: generateSecureKey(64),
  BCRYPT_ROUNDS: '12',
  SESSION_TIMEOUT: '3600',
  ENABLE_AUDIT_LOG: 'true',
  RATE_LIMIT_PER_MINUTE: '100',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: generatePassword(),
  ADMIN_EMAIL: 'admin@yourcompany.com'
};

// Create secure .env file
const envContent = `# 🔐 MCP Hub Secure Configuration
# Generated on ${new Date().toISOString()}
# ⚠️ KEEP THIS FILE SECURE - DO NOT COMMIT TO VERSION CONTROL

# =====================================================
# SECURITY CONFIGURATION
# =====================================================

# API Keys (Keep these secret!)
MCP_API_KEY=${secureConfig.MCP_API_KEY}
MCP_ADMIN_KEY=${secureConfig.MCP_ADMIN_KEY}

# JWT Configuration
JWT_SECRET=${secureConfig.JWT_SECRET}
BCRYPT_ROUNDS=${secureConfig.BCRYPT_ROUNDS}
SESSION_TIMEOUT=${secureConfig.SESSION_TIMEOUT}

# Security Settings
ENABLE_AUDIT_LOG=${secureConfig.ENABLE_AUDIT_LOG}
RATE_LIMIT_PER_MINUTE=${secureConfig.RATE_LIMIT_PER_MINUTE}

# Default Admin Account (CHANGE IMMEDIATELY AFTER FIRST LOGIN!)
ADMIN_USERNAME=${secureConfig.ADMIN_USERNAME}
ADMIN_PASSWORD=${secureConfig.ADMIN_PASSWORD}
ADMIN_EMAIL=${secureConfig.ADMIN_EMAIL}

# =====================================================
# DATABASE CONFIGURATION
# =====================================================

# MongoDB Connection (Update with your connection string)
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority&ssl=true
DB_NAME=mcphub

# =====================================================
# SECURITY NOTES
# =====================================================

# 1. Change ADMIN_PASSWORD immediately after first login
# 2. Update MONGO_URL with your actual MongoDB connection
# 3. Set ADMIN_EMAIL to a real email address
# 4. In production, use environment variables instead of .env file
# 5. Enable MongoDB authentication and SSL/TLS
# 6. Review audit logs regularly
# 7. Rotate API keys periodically

`;

// Write secure .env file
fs.writeFileSync('.env.secure', envContent);

// Create .gitignore entry
const gitignorePath = '.gitignore';
let gitignoreContent = '';

if (fs.existsSync(gitignorePath)) {
  gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
}

const securityEntries = [
  '.env.secure',
  '.env.production',
  'logs/',
  'audit_logs/',
  'ssl_certificates/',
  'private_keys/'
];

const newEntries = [];
securityEntries.forEach(entry => {
  if (!gitignoreContent.includes(entry)) {
    newEntries.push(entry);
  }
});

if (newEntries.length > 0) {
  const updatedGitignore = gitignoreContent + '\n\n# Security files\n' + newEntries.join('\n') + '\n';
  fs.writeFileSync(gitignorePath, updatedGitignore);
}

// Create security documentation
const securityDocsContent = `# 🔐 MCP Hub Security Setup Complete

## ✅ Security Configuration Generated

Your secure configuration has been created in \`.env.secure\`

### 🔑 Generated Credentials:

- **API Key**: \`${secureConfig.MCP_API_KEY}\`
- **Admin Key**: \`${secureConfig.MCP_ADMIN_KEY}\`
- **Admin Username**: \`${secureConfig.ADMIN_USERNAME}\`
- **Admin Password**: \`${secureConfig.ADMIN_PASSWORD}\`

### ⚠️ IMPORTANT SECURITY STEPS:

1. **Copy configuration**: \`cp .env.secure .env\`
2. **Update MongoDB URL** in \`.env\` with your connection string
3. **Change admin password** immediately after first login
4. **Test authentication** with the generated keys
5. **Set up user accounts** for your team

### 🚀 Start Secure Server:

\`\`\`bash
# Install security dependencies
npm install

# Start secure server
npm run start:secure
\`\`\`

### 🧪 Test Authentication:

\`\`\`bash
# Test API key access
export MCP_AUTH_HEADER="Bearer ${secureConfig.MCP_API_KEY}"

# Test admin access  
export MCP_AUTH_HEADER="Bearer ${secureConfig.MCP_ADMIN_KEY}"
\`\`\`

### 📋 Next Steps:

1. Create user accounts for your development team
2. Set up project-specific permissions
3. Configure audit log monitoring
4. Set up SSL/TLS certificates (for production)
5. Implement backup and recovery procedures

### 🔒 Security Best Practices:

- Rotate API keys every 90 days
- Use strong passwords (16+ characters)
- Enable two-factor authentication (coming soon)
- Monitor audit logs for suspicious activity
- Keep security dependencies updated
- Use HTTPS in production

### 📞 Support:

For security questions or enterprise features:
- Email: security@mcphub.ai
- Documentation: See SECURITY.md
`;

fs.writeFileSync('SECURITY_SETUP.md', securityDocsContent);

// Display completion message
console.log('✅ Security setup complete!\n');
console.log('📋 Configuration files created:');
console.log('   - .env.secure (secure environment variables)');
console.log('   - SECURITY_SETUP.md (setup instructions)');
console.log('   - .gitignore (updated with security entries)\n');

console.log('🔑 Generated credentials:');
console.log(`   Admin Username: ${secureConfig.ADMIN_USERNAME}`);
console.log(`   Admin Password: ${secureConfig.ADMIN_PASSWORD}`);
console.log(`   API Key: ${secureConfig.MCP_API_KEY.substring(0, 20)}...`);
console.log(`   Admin Key: ${secureConfig.MCP_ADMIN_KEY.substring(0, 20)}...\n`);

console.log('⚠️  IMPORTANT NEXT STEPS:');
console.log('   1. Copy secure config: cp .env.secure .env');
console.log('   2. Update MongoDB URL in .env');
console.log('   3. Install dependencies: npm install');
console.log('   4. Start secure server: npm run start:secure');
console.log('   5. Change admin password after first login\n');

console.log('📖 See SECURITY_SETUP.md for detailed instructions');
console.log('🔐 Security setup complete!');