// ============================================================
// logger.js — Action logger middleware
//
// After a request is successfully authorized and processed,
// we write a structured log entry to the agent_action_logs
// MongoDB collection in the mcphub database.
// ============================================================

import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mcphub'

let _db = null

async function getDb() {
  if (_db) return _db
  try {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    _db = client.db('mcphub')
    console.log('[logger] Connected to MongoDB')
  } catch (err) {
    console.error('[logger] MongoDB connection failed:', err.message)
  }
  return _db
}

// Call getDb on startup so the connection is ready
getDb()

export async function logAction(agentId, developerId, sessionId, action, resource, method, path, projectId, allowed, ip, statusCode, meta = {}) {
  try {
    const db = await getDb()
    if (!db) return

    await db.collection('agent_action_logs').insertOne({
      logId:       `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      agentId,
      developerId,
      sessionId,
      action,
      resource,
      method,
      path,
      projectId:   projectId || null,
      allowed,
      statusCode,
      ip,
      meta,
      timestamp:   new Date()
    })
  } catch (err) {
    console.error('[logger] Failed to write log:', err.message)
  }
}

// Express middleware — logs after response is finished
export function actionLoggerMiddleware(req, res, next) {
  const start = Date.now()

  res.on('finish', () => {
    if (!req.agent) return  // skip non-authenticated requests

    const allowed = res.statusCode < 400
    logAction(
      req.agent.agentId,
      req.agent.developerId,
      req.agent.sessionId,
      `${req.method} ${req.path}`,
      req.targetService || 'api-gateway',
      req.method,
      req.originalUrl,
      process.env.PROJECT_ID || null,
      allowed,
      req.ip,
      res.statusCode,
      { durationMs: Date.now() - start, userAgent: req.headers['user-agent'] }
    )
  })

  next()
}
