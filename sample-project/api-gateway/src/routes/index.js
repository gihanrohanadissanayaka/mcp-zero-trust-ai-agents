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

const AUTH_SERVICE_URL       = process.env.AUTH_SERVICE_URL       || 'http://localhost:4001'
const BOOKING_SERVICE_URL    = process.env.BOOKING_SERVICE_URL    || 'http://localhost:4002'
const TRAVELLER_SERVICE_URL  = process.env.TRAVELLER_SERVICE_URL  || 'http://localhost:4003'
const PAYMENT_SERVICE_URL    = process.env.PAYMENT_SERVICE_URL    || 'http://localhost:4004'
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
    if (req.agent?.agentId) {
      headers['x-agent-id'] = req.agent.agentId
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

// ── Agent identity check (mcpAuth already ran globally) ──────
// GET /agent/me — returns the validated agent context from the token.
// Used by the client Settings page to verify a token before saving.
router.get('/agent/me', (req, res) => {
  // req.agent is populated by mcpAuth middleware if we get here
  res.json({
    success:  true,
    agentId:  req.agent.agentId,
    sessionId: req.agent.sessionId,
    allowedProjects:   req.agent.allowedProjects,
    allowedOperations: req.agent.allowedOperations,
    expiresAt: req.agent.expiresAt
  })
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

// ── Traveller → Payment nested routes (must be BEFORE /travellers/* catch-all) ──

// GET /travellers/:travellerId/payments/summary
router.get('/travellers/:travellerId/payments/summary', requireUser, (req, res) => {
  forward(req, res, PAYMENT_SERVICE_URL, `/summary/${req.params.travellerId}`)
})

// GET  /travellers/:travellerId/payments  — list payments for this traveller
router.get('/travellers/:travellerId/payments', requireUser, (req, res) => {
  forward(req, res, PAYMENT_SERVICE_URL, `/?travellerId=${req.params.travellerId}`)
})

// POST /travellers/:travellerId/payments  — create payment, auto-inject travellerId
router.post('/travellers/:travellerId/payments', requireUser, (req, res) => {
  req.body = { ...req.body, travellerId: req.params.travellerId }
  forward(req, res, PAYMENT_SERVICE_URL, '/')
})

// GET | PUT | DELETE /travellers/:travellerId/payments/:paymentId
router.get('/travellers/:travellerId/payments/:paymentId', requireUser, (req, res) => {
  forward(req, res, PAYMENT_SERVICE_URL, `/${req.params.paymentId}`)
})
router.put('/travellers/:travellerId/payments/:paymentId', requireUser, (req, res) => {
  forward(req, res, PAYMENT_SERVICE_URL, `/${req.params.paymentId}`)
})
router.delete('/travellers/:travellerId/payments/:paymentId', requireUser, (req, res) => {
  forward(req, res, PAYMENT_SERVICE_URL, `/${req.params.paymentId}`)
})

// DELETE /travellers/:id — cascade: delete traveller + payments + bank details
router.delete('/travellers/:id', requireUser, async (req, res) => {
  try {
    const tRes = await axios({
      method: 'delete',
      url:    `${TRAVELLER_SERVICE_URL}/${req.params.id}`,
      timeout: 10000,
      validateStatus: () => true
    })
    if (!tRes.data?.success) return res.status(tRes.status).json(tRes.data)

    // cascade — ignore errors if downstream services are down
    await Promise.allSettled([
      axios({ method: 'delete', url: `${PAYMENT_SERVICE_URL}/by-traveller/${req.params.id}`, timeout: 10000, validateStatus: () => true }),
      axios({ method: 'delete', url: `${TRAVELLER_SERVICE_URL}/bank-details/by-traveller/${req.params.id}`, timeout: 10000, validateStatus: () => true })
    ])

    res.json({ success: true, message: 'Traveller, payments, and bank details deleted' })
  } catch (err) {
    console.error('[gateway] Cascade delete error:', err.message)
    res.status(502).json({ success: false, error: `Service unavailable: ${err.message}` })
  }
})

// ── Traveller → Bank Details nested routes ───────────────────
// (registered before /travellers/* catch-all)

router.get('/travellers/:travellerId/bank-details', requireUser, (req, res) => {
  forward(req, res, TRAVELLER_SERVICE_URL, `/bank-details?travellerId=${req.params.travellerId}`)
})

router.post('/travellers/:travellerId/bank-details', requireUser, (req, res) => {
  req.body = { ...req.body, travellerId: req.params.travellerId }
  forward(req, res, TRAVELLER_SERVICE_URL, '/bank-details')
})

router.get('/travellers/:travellerId/bank-details/:bankDetailId', requireUser, (req, res) => {
  forward(req, res, TRAVELLER_SERVICE_URL, `/bank-details/${req.params.bankDetailId}`)
})

router.put('/travellers/:travellerId/bank-details/:bankDetailId', requireUser, (req, res) => {
  forward(req, res, TRAVELLER_SERVICE_URL, `/bank-details/${req.params.bankDetailId}`)
})

router.delete('/travellers/:travellerId/bank-details/:bankDetailId', requireUser, (req, res) => {
  forward(req, res, TRAVELLER_SERVICE_URL, `/bank-details/${req.params.bankDetailId}`)
})

// ── Traveller routes (login required) ───────────────────────
router.all('/travellers', requireUser, (req, res) => {
  forward(req, res, TRAVELLER_SERVICE_URL, '/')
})

router.all('/travellers/*', requireUser, (req, res) => {
  const path = req.originalUrl.replace(/^\/travellers/, '') || '/'
  forward(req, res, TRAVELLER_SERVICE_URL, path)
})

// ── Payment routes (login required) ─────────────────────────
router.all('/payments', requireUser, (req, res) => {
  forward(req, res, PAYMENT_SERVICE_URL, '/')
})

router.all('/payments/*', requireUser, (req, res) => {
  const path = req.originalUrl.replace(/^\/payments/, '') || '/'
  forward(req, res, PAYMENT_SERVICE_URL, path)
})

// ── 404 fallback ─────────────────────────────────────────────
router.use((_req, res) => {
  res.status(404).json({
    success: false,
    error:   'Route not found',
    hint:    'Available: /health, /auth/register, /auth/login, /auth/me, /bookings, /travellers, /payments'
  })
})

export { router }
