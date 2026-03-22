#!/usr/bin/env node

// Centralized MongoDB Database Connection Module
// ==============================================

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Database configuration
const DB_CONFIG = {
  url: process.env.MONGO_URL,
  dbName: process.env.DB_NAME || "mcphub",
  options: {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
  }
};

// Global connection state
let client = null;
let db = null;
let isConnected = false;

// Connection status
export const getConnectionStatus = () => ({
  isConnected,
  dbName: DB_CONFIG.dbName,
  url: DB_CONFIG.url ? DB_CONFIG.url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') : 'Not configured'
});

// Connect to MongoDB
export async function connectToMongoDB() {
  if (isConnected && client) {
    console.error("✅ Already connected to MongoDB");
    return { client, db };
  }

  try {
    if (!DB_CONFIG.url) {
      throw new Error("MONGO_URL environment variable is required");
    }

    console.error("🔄 Connecting to MongoDB...");
    
    client = new MongoClient(DB_CONFIG.url, DB_CONFIG.options);
    await client.connect();
    
    // Test the connection
    await client.db("admin").command({ ping: 1 });
    
    db = client.db(DB_CONFIG.dbName);
    isConnected = true;
    
    console.error("✅ Connected to MongoDB successfully");
    console.error(`📊 Database: ${DB_CONFIG.dbName}`);
    
    // Set up indexes for better performance
    await setupIndexes();
    
    return { client, db };
    
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error.message);
    isConnected = false;
    throw error;
  }
}

// Get database instance
export function getDatabase() {
  if (!isConnected || !db) {
    throw new Error("Database not connected. Call connectToMongoDB() first.");
  }
  return db;
}

// Get client instance
export function getClient() {
  if (!isConnected || !client) {
    throw new Error("Database not connected. Call connectToMongoDB() first.");
  }
  return client;
}

// Setup database indexes for performance
async function setupIndexes() {
  try {
    console.error("🔄 Setting up database indexes...");
    
    // Use Cases collection indexes
    await db.collection('use_cases').createIndex(
      { title: "text", description: "text" },
      { name: "use_cases_text_idx" }
    );
    
    await db.collection('use_cases').createIndex(
      { tags: 1 },
      { name: "use_cases_tags_idx" }
    );
    
    await db.collection('use_cases').createIndex(
      { projectId: 1 },
      { name: "use_cases_project_idx" }
    );

    // API Keys collection indexes
    await db.collection('api_keys').createIndex(
      { key: 1 },
      { name: "api_keys_key_idx", unique: true }
    );
    
    await db.collection('api_keys').createIndex(
      { userId: 1 },
      { name: "api_keys_user_idx" }
    );
    
    await db.collection('api_keys').createIndex(
      { active: 1 },
      { name: "api_keys_active_idx" }
    );

    // Users collection indexes (for future use)
    await db.collection('users').createIndex(
      { username: 1 },
      { name: "users_username_idx", unique: true }
    );
    
    await db.collection('users').createIndex(
      { email: 1 },
      { name: "users_email_idx", unique: true }
    );

    // Projects collection indexes
    await db.collection('projects').createIndex(
      { projectId: 1 },
      { name: "projects_id_idx", unique: true }
    );

    // Audit logs collection indexes
    await db.collection('audit_logs').createIndex(
      { timestamp: -1 },
      { name: "audit_logs_timestamp_idx" }
    );
    
    await db.collection('audit_logs').createIndex(
      { userId: 1, timestamp: -1 },
      { name: "audit_logs_user_timestamp_idx" }
    );
    
    await db.collection('audit_logs').createIndex(
      { action: 1 },
      { name: "audit_logs_action_idx" }
    );

    // =========================================================
    // Zero Trust — Agent Identity collections (Phase 1)
    // =========================================================

    // agents — primary lookup by agentId
    await db.collection('agents').createIndex(
      { agentId: 1 },
      { name: "agents_agentId_idx", unique: true }
    );
    await db.collection('agents').createIndex(
      { developerId: 1 },
      { name: "agents_developerId_idx" }
    );
    await db.collection('agents').createIndex(
      { active: 1 },
      { name: "agents_active_idx" }
    );

    // agent_sessions — fast token / session lookups
    await db.collection('agent_sessions').createIndex(
      { sessionId: 1 },
      { name: "agent_sessions_sessionId_idx", unique: true }
    );
    await db.collection('agent_sessions').createIndex(
      { agentId: 1, revoked: 1 },
      { name: "agent_sessions_agentId_revoked_idx" }
    );
    await db.collection('agent_sessions').createIndex(
      { expiresAt: 1 },
      { name: "agent_sessions_expiry_idx", expireAfterSeconds: 0 }  // TTL index
    );

    // agent_policies — policy lookup by agentId
    await db.collection('agent_policies').createIndex(
      { agentId: 1 },
      { name: "agent_policies_agentId_idx", unique: true }
    );
    await db.collection('agent_policies').createIndex(
      { developerId: 1 },
      { name: "agent_policies_developerId_idx" }
    );

    // agent_audit_log — queryable by agent, time, tool, decision
    await db.collection('agent_audit_log').createIndex(
      { timestamp: -1 },
      { name: "agent_audit_timestamp_idx" }
    );
    await db.collection('agent_audit_log').createIndex(
      { agentId: 1, timestamp: -1 },
      { name: "agent_audit_agentId_time_idx" }
    );
    await db.collection('agent_audit_log').createIndex(
      { developerId: 1, timestamp: -1 },
      { name: "agent_audit_developerId_time_idx" }
    );
    await db.collection('agent_audit_log').createIndex(
      { tool: 1, decision: 1 },
      { name: "agent_audit_tool_decision_idx" }
    );
    await db.collection('agent_audit_log').createIndex(
      { sessionId: 1 },
      { name: "agent_audit_sessionId_idx" }
    );

    console.error("✅ Database indexes created successfully");
    
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.error("ℹ️ Database indexes already exist");
    } else {
      console.error("⚠️ Error creating indexes:", error.message);
    }
  }
}

// Close database connection
export async function closeDatabaseConnection() {
  if (client) {
    try {
      await client.close();
      console.error("✅ MongoDB connection closed");
      client = null;
      db = null;
      isConnected = false;
    } catch (error) {
      console.error("❌ Error closing MongoDB connection:", error.message);
    }
  }
}

// Health check for database
export async function checkDatabaseHealth() {
  try {
    if (!isConnected || !client) {
      return { healthy: false, error: "Not connected" };
    }
    
    // Ping the database
    await client.db("admin").command({ ping: 1 });
    
    // Check collections exist and get stats
    const collections = await db.listCollections().toArray();
    const stats = await db.stats();
    
    return {
      healthy: true,
      connected: true,
      database: DB_CONFIG.dbName,
      collections: collections.map(c => c.name),
      stats: {
        documents: stats.objects || 0,
        dataSize: stats.dataSize || 0,
        indexSize: stats.indexSize || 0
      }
    };
    
  } catch (error) {
    return {
      healthy: false,
      connected: false,
      error: error.message
    };
  }
}

// Graceful shutdown handler
export function setupGracefulShutdown() {
  const handleShutdown = async (signal) => {
    console.error(`\n📴 Received ${signal}. Closing database connection...`);
    await closeDatabaseConnection();
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
  process.on('SIGUSR2', handleShutdown); // For nodemon
}

export default {
  connectToMongoDB,
  getDatabase,
  getClient,
  getConnectionStatus,
  checkDatabaseHealth,
  closeDatabaseConnection,
  setupGracefulShutdown
};