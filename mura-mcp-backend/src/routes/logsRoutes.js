// ============================================================
// Logs REST Routes  — /api/logs
//
// Read-only view into agent_action_logs for the authenticated
// developer. Supports filtering by project, tool, status, and
// date range with cursor-based pagination.
//
// GET  /api/logs            — list logs (paged, filterable)
// GET  /api/logs/stats      — aggregate counts by status/tool
// GET  /api/logs/:logId     — full detail for one log entry
// ============================================================

import express from 'express'
import { getDatabase } from '../config/database/connection.js'

const router = express.Router()

// ── Auth middleware ───────────────────────────────────────────
async function requireApiKey(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authorization header required: Bearer <api-key>' })
  }
  const key = authHeader.substring(7)
  try {
    const db  = getDatabase()
    const rec = await db.collection('api_keys').findOne({ key, active: true })
    if (!rec) return res.status(401).json({ success: false, error: 'Invalid or inactive API key' })
    await db.collection('api_keys').updateOne({ key }, { $set: { lastUsed: new Date() } })
    req.caller = {
      developerId: rec.developerId?.toString() || 'unknown',
      email:       rec.email || 'unknown'
    }
    next()
  } catch (err) {
    res.status(500).json({ success: false, error: 'Authentication error' })
  }
}

// ============================================================
// GET /api/logs/stats — aggregate metrics for the dashboard
// ============================================================
router.get('/stats', requireApiKey, async (req, res) => {
  try {
    const db      = getDatabase()
    const { projectId, since } = req.query

    const match = { developerId: req.caller.developerId }
    if (projectId) match.projectId = projectId
    if (since)     match.timestamp = { $gte: new Date(since) }

    const [byStatus, byTool, latency] = await Promise.all([
      // Count by status
      db.collection('agent_action_logs').aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).toArray(),

      // Count by tool
      db.collection('agent_action_logs').aggregate([
        { $match: match },
        { $group: { _id: '$tool', count: { $sum: 1 }, avgDurationMs: { $avg: '$durationMs' } } }
      ]).toArray(),

      // Avg latency per day (last 14 days)
      db.collection('agent_action_logs').aggregate([
        { $match: { ...match, timestamp: { $gte: new Date(Date.now() - 14 * 86400000) } } },
        {
          $group: {
            _id: {
              y: { $year: '$timestamp' },
              m: { $month: '$timestamp' },
              d: { $dayOfMonth: '$timestamp' }
            },
            avgDurationMs: { $avg: '$durationMs' },
            count:         { $sum: 1 }
          }
        },
        { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } }
      ]).toArray()
    ])

    const total  = byStatus.reduce((s, r) => s + r.count, 0)
    const statusMap = Object.fromEntries(byStatus.map(r => [r._id, r.count]))

    res.json({
      success: true,
      data: {
        total,
        byStatus:  statusMap,
        byTool:    byTool.map(r => ({ tool: r._id, count: r.count, avgDurationMs: Math.round(r.avgDurationMs) })),
        latencyTrend: latency.map(r => ({
          date:          `${r._id.y}-${String(r._id.m).padStart(2,'0')}-${String(r._id.d).padStart(2,'0')}`,
          avgDurationMs: Math.round(r.avgDurationMs),
          count:         r.count
        }))
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ============================================================
// GET /api/logs — list with filters + pagination
// Query params:
//   projectId  — filter by project
//   tool       — filter by tool name
//   status     — success | failed | rejected
//   from       — ISO date string  (start of range)
//   to         — ISO date string  (end of range)
//   page       — page number (default 1)
//   limit      — page size   (default 20, max 100)
// ============================================================
router.get('/', requireApiKey, async (req, res) => {
  try {
    const db = getDatabase()
    const {
      projectId, tool, status,
      from, to,
      page  = '1',
      limit = '20'
    } = req.query

    const pageNum  = Math.max(1, parseInt(page,  10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
    const skip     = (pageNum - 1) * pageSize

    // Build filter — always scoped to this developer
    const filter = { developerId: req.caller.developerId }
    if (projectId) filter.projectId = projectId
    if (tool)      filter.tool      = tool
    if (status)    filter.status    = status
    if (from || to) {
      filter.timestamp = {}
      if (from) filter.timestamp.$gte = new Date(from)
      if (to)   filter.timestamp.$lte = new Date(to)
    }

    const [logs, total] = await Promise.all([
      db.collection('agent_action_logs')
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(pageSize)
        // Return list-safe projection (no full content for list view)
        .project({
          _id:         0,
          logId:       1,
          tool:        1,
          status:      1,
          allowed:     1,
          projectId:   1,
          projectName: 1,
          environment: 1,
          callerEmail: 1,
          callerName:  1,
          durationMs:  1,
          ip:          1,
          error:       1,
          'request.tool':        1,
          'request.receivedAt':  1,
          'request.projectId':   1,
          'response.model':      1,
          'response.tokenUsage': 1,
          timestamp:   1
        })
        .toArray(),
      db.collection('agent_action_logs').countDocuments(filter)
    ])

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page:      pageNum,
          pageSize,
          pages:     Math.ceil(total / pageSize),
          hasMore:   pageNum * pageSize < total
        }
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ============================================================
// GET /api/logs/:logId — full detail (including full request/response)
// ============================================================
router.get('/:logId', requireApiKey, async (req, res) => {
  try {
    const db  = getDatabase()
    const log = await db.collection('agent_action_logs').findOne(
      { logId: req.params.logId },
      { projection: { _id: 0 } }
    )
    if (!log) return res.status(404).json({ success: false, error: 'Log not found' })

    // Scope check — only own logs
    if (log.developerId !== req.caller.developerId) {
      return res.status(403).json({ success: false, error: 'Access denied' })
    }

    res.json({ success: true, data: { log } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export { router as logsRoutes }
