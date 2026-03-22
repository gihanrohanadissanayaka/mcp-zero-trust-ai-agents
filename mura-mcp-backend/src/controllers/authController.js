#!/usr/bin/env node

// Authentication Controller for MCP Hub
// Handles developer registration, login, and API key management
// ============================================================

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getDatabase } from '../config/database/connection.js';

// Get database instance
function getDB() {
  return getDatabase();
}

// Generate secure API key
function generateApiKey(prefix = 'mcphub') {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(24).toString('hex');
  return `${prefix}_${timestamp}_${randomPart}`;
}

// Hash password
async function hashPassword(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// =====================================================
// CONTROLLER FUNCTIONS
// =====================================================

/**
 * Register new developer
 * POST /api/auth/register
 */
export async function registerDeveloper(req, res) {
  try {
    const db = getDB();
    const { name, email, company, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    // Check if developer already exists
    const existingDev = await db.collection('developers').findOne({
      email: email
    });

    if (existingDev) {
      return res.status(409).json({
        success: false,
        error: 'Developer with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate API key
    const apiKey = generateApiKey('mcphub');
    
    // Create developer record
    const developer = {
      name,
      email,
      company: company || '',
      password: hashedPassword,
      createdAt: new Date(),
      lastLogin: null,
      active: true
    };

    // Insert developer
    const developerResult = await db.collection('developers').insertOne(developer);
    const developerId = developerResult.insertedId;

    // Create API key record
    const apiKeyRecord = {
      key: apiKey,
      developerId: developerId,
      email: email,
      name: `${name} - Primary Key`,
      description: 'Primary API key for developer access',
      permissions: ['read', 'write'], // Full access except admin
      active: true,
      createdAt: new Date(),
      lastUsed: null,
      expiresAt: null // No expiration
    };

    await db.collection('api_keys').insertOne(apiKeyRecord);

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Developer registered successfully',
      data: {
        developerId: developerId.toString(),
        username,
        email,
        name,
        company,
        apiKey,
        projectAccess,
        createdAt: developer.createdAt
      }
    });

  } catch (error) {
    console.error('Error registering developer:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during registration'
    });
  }
}

/**
 * Generate new API key for existing developer
 * POST /api/auth/generate-key
 */
export async function generateNewApiKey(req, res) {
  try {
    const db = getDB();
    const { username, name, description } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    // Find developer
    const developer = await db.collection('developers').findOne({ username });
    if (!developer) {
      return res.status(404).json({
        success: false,
        error: 'Developer not found'
      });
    }

    // Generate new API key
    const apiKey = generateApiKey('mcphub');
    
    // Create API key record
    const apiKeyRecord = {
      key: apiKey,
      developerId: developer._id,
      username: username,
      name: name || `${developer.name} - Additional Key`,
      description: description || 'Additional API key',
      permissions: ['read', 'write'],
      active: true,
      createdAt: new Date(),
      lastUsed: null,
      expiresAt: null // No expiration
    };

    await db.collection('api_keys').insertOne(apiKeyRecord);

    res.json({
      success: true,
      message: 'New API key generated successfully',
      data: {
        apiKey,
        name: apiKeyRecord.name,
        description: apiKeyRecord.description,
        createdAt: apiKeyRecord.createdAt
      }
    });

  } catch (error) {
    console.error('Error generating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during key generation'
    });
  }
}

/**
 * Refresh/regenerate existing API key
 * POST /api/auth/refresh-key
 */
export async function refreshApiKey(req, res) {
  try {
    const db = getDB();
    const { currentApiKey } = req.body;

    if (!currentApiKey) {
      return res.status(400).json({
        success: false,
        error: 'Current API key is required'
      });
    }

    // Find existing API key
    const existingKey = await db.collection('api_keys').findOne({ 
      key: currentApiKey,
      active: true 
    });

    if (!existingKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found or inactive'
      });
    }

    // Generate new API key
    const newApiKey = generateApiKey('mcphub');
    
    // Update the existing record with new key
    await db.collection('api_keys').updateOne(
      { _id: existingKey._id },
      { 
        $set: { 
          key: newApiKey,
          refreshedAt: new Date(),
          lastUsed: null
        }
      }
    );

    res.json({
      success: true,
      message: 'API key refreshed successfully',
      data: {
        apiKey: newApiKey,
        name: existingKey.name,
        description: existingKey.description,
        refreshedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error refreshing API key:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during key refresh'
    });
  }
}

/**
 * Get developer profile and API keys
 * GET /api/auth/profile
 */
export async function getDeveloperProfile(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required as query parameter'
      });
    }

    // Find developer
    const developer = await db.collection('developers').findOne({ username });
    if (!developer) {
      return res.status(404).json({
        success: false,
        error: 'Developer not found'
      });
    }

    // Get API keys for this developer
    const apiKeys = await db.collection('api_keys').find({ 
      developerId: developer._id,
      active: true 
    }).toArray();

    // Mask API keys for security (only show last 8 characters)
    const maskedKeys = apiKeys.map(key => ({
      id: key._id.toString(),
      name: key.name,
      description: key.description,
      keyPreview: `***${key.key.slice(-8)}`,
      permissions: key.permissions,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      expiresAt: key.expiresAt
    }));

    res.json({
      success: true,
      data: {
        developer: {
          id: developer._id.toString(),
          username: developer.username,
          email: developer.email,
          name: developer.name,
          company: developer.company,
          projectAccess: developer.projectAccess,
          createdAt: developer.createdAt,
          lastLogin: developer.lastLogin,
          active: developer.active
        },
        apiKeys: maskedKeys,
        totalKeys: maskedKeys.length
      }
    });

  } catch (error) {
    console.error('Error getting developer profile:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during profile retrieval'
    });
  }
}

/**
 * Validate API key (internal function for middleware)
 */
export async function validateApiKey(apiKey) {
  try {
    const db = getDB();
    
    const keyRecord = await db.collection('api_keys').findOne({
      key: apiKey,
      active: true
    });

    if (!keyRecord) {
      return { valid: false, error: 'Invalid or inactive API key' };
    }

    // Update last used timestamp
    await db.collection('api_keys').updateOne(
      { _id: keyRecord._id },
      { $set: { lastUsed: new Date() } }
    );

    // Get developer info
    const developer = await db.collection('developers').findOne({
      _id: keyRecord.developerId,
      active: true
    });

    if (!developer) {
      return { valid: false, error: 'Developer account inactive' };
    }

    return {
      valid: true,
      developer,
      apiKey: keyRecord,
      permissions: keyRecord.permissions
    };

  } catch (error) {
    console.error('Error validating API key:', error);
    return { valid: false, error: 'Internal server error during validation' };
  }
}

/**
 * List all developers (admin function)
 * GET /api/auth/developers
 */
export async function listDevelopers(req, res) {
  try {
    const db = getDB();
    
    const developers = await db.collection('developers').find({
      active: true
    }).project({
      username: 1,
      email: 1,
      name: 1,
      company: 1,
      createdAt: 1,
      lastLogin: 1,
      projectAccess: 1
    }).toArray();

    // Get API key counts for each developer
    const developersWithKeyCount = await Promise.all(
      developers.map(async (dev) => {
        const keyCount = await db.collection('api_keys').countDocuments({
          developerId: dev._id,
          active: true
        });
        return {
          ...dev,
          id: dev._id.toString(),
          apiKeyCount: keyCount
        };
      })
    );

    res.json({
      success: true,
      data: {
        developers: developersWithKeyCount,
        total: developersWithKeyCount.length
      }
    });

  } catch (error) {
    console.error('Error listing developers:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during developer listing'
    });
  }
}

// Email + password login — looks up developer record and returns API key
export async function loginDeveloper(req, res) {
  try {
    const { email, password } = req.body;
    const result = await authController.loginDeveloperService(email, password);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
}

const authController = {
  registerDeveloper,
  loginDeveloper,
  generateNewApiKey,
  refreshApiKey,
  getDeveloperProfile,
  validateApiKey,
  listDevelopers,
  // Service functions (non-Express)
  registerDeveloperService: async (data) => {
    const db = getDB();
    const { name, email, company, password, projects = [] } = data;
    
    if (!name || !email) {
      throw new Error('Name and email are required');
    }
    
    // Check if email already exists
    const existingDev = await db.collection('api_keys').findOne({ 
      'metadata.email': email 
    });
    
    if (existingDev) {
      throw new Error('Email already registered');
    }
    
    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await hashPassword(password);
    }
    
    // Generate API key
    const apiKey = generateApiKey('mcphub');
    
    // Create developer record
    const developerData = {
      key: apiKey,
      name: name,
      userId: `dev_${Date.now()}`,
      active: true,
      permissions: ['read', 'write', 'create', 'update', 'delete'],
      createdAt: new Date(),
      lastUsed: null,
      expiresAt: null, // No expiration
      metadata: {
        email,
        company: company || '',
        projects: projects,
        role: 'developer',
        passwordHash: hashedPassword
      }
    };
    
    await db.collection('api_keys').insertOne(developerData);
    
    return {
      apiKey,
      developerId: developerData.userId,
      name,
      email,
      company,
      projects,
      permissions: developerData.permissions,
      message: 'Developer registered successfully! Save your API key - it cannot be retrieved later.'
    };
  },

  loginDeveloperService: async (email, password) => {
    const db = getDB();

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Find developer by email in 'developers' collection
    const developer = await db.collection('developers').findOne({ email, active: true });

    if (!developer) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    if (!developer.password) {
      throw new Error('This account has no password set. Please use your API key to sign in.');
    }

    const valid = await verifyPassword(password, developer.password);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    // Find the active API key for this developer
    const apiKeyRecord = await db.collection('api_keys').findOne({
      developerId: developer._id,
      active: true
    });

    if (!apiKeyRecord) {
      throw new Error('No active API key found for this account. Please contact support.');
    }

    // Update lastLogin
    await db.collection('developers').updateOne(
      { _id: developer._id },
      { $set: { lastLogin: new Date() } }
    );

    return {
      apiKey: apiKeyRecord.key,
      developerId: developer._id.toString(),
      name: developer.name,
      email: developer.email,
      company: developer.company || '',
      permissions: apiKeyRecord.permissions || ['read', 'write'],
      role: 'developer'
    };
  },
  
  refreshApiKeyService: async (oldApiKey) => {
    const db = getDB();
    
    // Find existing key
    const existingKey = await db.collection('api_keys').findOne({ 
      key: oldApiKey, 
      active: true 
    });
    
    if (!existingKey) {
      throw new Error('Invalid or inactive API key');
    }
    
    // Generate new key
    const newApiKey = generateApiKey('mcphub');
    
    // Update record
    const result = await db.collection('api_keys').updateOne(
      { key: oldApiKey },
      { 
        $set: { 
          key: newApiKey, 
          lastRefreshed: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      throw new Error('Failed to refresh API key');
    }
    
    return {
      newApiKey,
      oldApiKey,
      refreshedAt: new Date(),
      message: 'API key refreshed successfully! Update your configuration with the new key.'
    };
  },
  
  getDeveloperInfoService: async (apiKey) => {
    const db = getDB();
    
    const developer = await db.collection('api_keys').findOne(
      { key: apiKey, active: true },
      { projection: { key: 0 } } // Don't return the key in the response
    );
    
    if (!developer) {
      throw new Error('Invalid or inactive API key');
    }
    
    return {
      developerId: developer.userId,
      name: developer.name,
      email: developer.metadata?.email,
      company: developer.metadata?.company,
      projects: developer.metadata?.projects || [],
      permissions: developer.permissions,
      role: developer.metadata?.role || 'developer',
      createdAt: developer.createdAt,
      lastUsed: developer.lastUsed
    };
  },
  
  listDevelopersService: async () => {
    const db = getDB();
    
    const developers = await db.collection('api_keys').find(
      {},
      { 
        projection: { 
          key: 0 // Don't return API keys in list
        } 
      }
    ).sort({ createdAt: -1 }).toArray();
    
    return developers.map(dev => ({
      developerId: dev.userId,
      name: dev.name,
      email: dev.metadata?.email,
      company: dev.metadata?.company,
      active: dev.active,
      createdAt: dev.createdAt,
      lastUsed: dev.lastUsed,
      permissions: dev.permissions
    }));
  },
  
  deactivateApiKeyService: async (apiKey) => {
    const db = getDB();
    
    const result = await db.collection('api_keys').updateOne(
      { key: apiKey },
      { 
        $set: { 
          active: false, 
          deactivatedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      throw new Error('API key not found');
    }
    
    return {
      message: 'API key deactivated successfully',
      deactivatedAt: new Date()
    };
  },

  registerDeveloperService: async (data) => {
    const db = getDB();
    const { name, email, company, password } = data;

    // Check if developer already exists
    const existingDev = await db.collection('developers').findOne({
      email: email
    });

    if (existingDev) {
      throw new Error('Developer with this email already exists');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate API key
    const apiKey = generateApiKey('mcphub');
    
    // Create developer record
    const developer = {
      name,
      email,
      company: company || '',
      password: hashedPassword,
      createdAt: new Date(),
      lastLogin: null,
      active: true
    };

    // Insert developer
    const developerResult = await db.collection('developers').insertOne(developer);
    const developerId = developerResult.insertedId;

    // Create API key record
    const apiKeyRecord = {
      key: apiKey,
      developerId: developerId,
      email: email,
      name: `${name} - Primary Key`,
      description: 'Primary API key for developer access',
      permissions: ['read', 'write'],
      createdAt: new Date(),
      lastUsed: null,
      expiresAt: null, // Never expires
      active: true
    };

    // Insert API key
    await db.collection('api_keys').insertOne(apiKeyRecord);

    return {
      success: true,
      developer: {
        id: developerId,
        name: developer.name,
        email: developer.email,
        company: developer.company
      },
      apiKey: apiKey
    };
  }
};

// Named exports for service functions
export async function registerDeveloperService(data) {
  const db = getDB();
  const { name, email, company, password } = data;

  // Check if developer already exists
  const existingDev = await db.collection('developers').findOne({
    email: email
  });

  if (existingDev) {
    throw new Error('Developer with this email already exists');
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Generate API key
  const apiKey = generateApiKey('mcphub');
  
  // Create developer record
  const developer = {
    name,
    email,
    company: company || '',
    password: hashedPassword,
    createdAt: new Date(),
    lastLogin: null,
    active: true
  };

  // Insert developer
  const developerResult = await db.collection('developers').insertOne(developer);
  const developerId = developerResult.insertedId;

  // Create API key record
  const apiKeyRecord = {
    key: apiKey,
    developerId: developerId,
    email: email,
    name: `${name} - Primary Key`,
    description: 'Primary API key for developer access',
    permissions: ['read', 'write'],
    createdAt: new Date(),
    lastUsed: null,
    expiresAt: null, // Never expires
    active: true
  };

  // Insert API key
  await db.collection('api_keys').insertOne(apiKeyRecord);

  return {
    success: true,
    developer: {
      id: developerId,
      name: developer.name,
      email: developer.email,
      company: developer.company
    },
    apiKey: apiKey
  };
}

export default authController;

// Named export for login service (used by server.js)
export async function loginDeveloperService(email, password) {
  return authController.loginDeveloperService(email, password);
}