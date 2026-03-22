// ============================================================
// routes/index.js — API Gateway routing (standalone)
//
// Auth routes  → public (register, login, me)
// Booking routes → requires valid user JWT
// ============================================================

import express from 'express'
import axios   from 'axios'
import jwt     from 'jsonwebtoken'

const router = express.Router()

const AUTH_SERVICE_URL    = process.env.AUTH_SERVICE_URL    || 'http://localhost:4001'
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:4002'
const JWT_SECRET          = process.env.JWT_SECRET          || 'auth-service-secret-change-me'

// ── Helper: forward to an internal service ──────────────────
async function forward(req, res, targetBase, targetPath) {
  const url = `${targetBase}${targetPath}`
  try {
    const headers = {
      'Content-Type':    'application/json',
      'x-forwarded-for': req.ip,
    }
    if (req.user) {
      headers['x-user-id']    = req.user.sub
      headers['x-user-email'] = req.user.email || ''
    }
    if (req.headers.authorization) {
      headers['authorization'] = req.headers.authorization
    }
    const { data, status } = await axios({
      method: req.method.toLowerCase(),
      url,
      data:   req.body,
      headers,
      timeout: 10000,
      validateStatus: () => true
    })
    res.status(status).json(data)
  } catch (err) {
    console.error(`[gateway] Forward error → ${url}:`, err.message)
    res.status(502).json({ success: false, error: `Service unavailable: ${err.message}` })
  }
}

// ── Middleware: require a valid user JWT ─────────────────────
function requireUser(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Please log in to continue.' })
  }
  try {
    req.user = jwt.verify(header.substring(7), JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Session expired. Please log in again.' })
  }
}

// ── Health (public) ──────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', gateway: 'api-gateway', mode: 'standalone' })
})

// ── Auth routes (public) ─────────────────────────────────────
router.all('/auth/*', (req, res) => {
  const path = req.originalUrl.replace(/^\/auth/, '') || '/'
  forward(req, res, AUTH_SERVICE_URL, path)
})

// ── Booking routes (login required) ──────────────────────────
router.all('/bookings', requireUser, (req, res) => {
  forward(req, res, BOOKING_SERVICE_URL, '/')
})

router.all('/bookings/*', requireUser, (req, res) => {
  const path = req.originalUrl.replace(/^\/bookings/, '') || '/'
  forward(req, res, BOOKING_SERVICE_URL, path)
})

// ── 404 fallback ─────────────────────────────────────────────
router.use((_req, res) => {
  res.status(404).json({
    success: false,
    error:   'Route not found',
    hint:    'Available: /health, /auth/register, /auth/login, /auth/me, /bookings'
  })
})

export { router }
