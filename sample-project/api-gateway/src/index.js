// ============================================================
// api-gateway/src/index.js
//
// Entry point for the API Gateway (standalone mode).
// Routes user requests to auth-service and booking-service.
// Auth routes are public; booking routes require a user JWT.
// ============================================================

import 'dotenv/config'
import express from 'express'
import cors    from 'cors'
import morgan  from 'morgan'
import { router }                  from './routes/index.js'
import { mcpAuth }                 from './middleware/mcpAuth.js'
import { actionLoggerMiddleware }  from './middleware/logger.js'

const app  = express()
const PORT = process.env.GATEWAY_PORT || process.env.PORT || 4000

// ── Middleware ───────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5174']
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('CORS: origin not allowed'))
  },
  credentials: true,
}))
app.use(express.json())
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'))

// ── Zero-Trust: log every authenticated request ──────────────
// actionLoggerMiddleware fires on res.finish; skips non-agent requests automatically
app.use(actionLoggerMiddleware)

// ── Zero-Trust: validate MCP agent token ─────────────────────
// Public paths (health + auth) bypass the check; everything else requires a valid agent session.
app.use((req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth/')) return next()
  return mcpAuth(req, res, next)
})

// ── Routes ───────────────────────────────────────────────────
app.use('/', router)

// ── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[gateway] Unhandled error:', err)
  res.status(500).json({ success: false, error: 'Internal gateway error' })
})

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║         Booking System — API Gateway             ║
╠══════════════════════════════════════════════════╣
║  Gateway:            http://localhost:${PORT}       ║
║  Auth-Service:       ${process.env.AUTH_SERVICE_URL || 'http://localhost:4001'}   ║
║  Booking-Service:    ${process.env.BOOKING_SERVICE_URL || 'http://localhost:4002'} ║
║  Traveller-Service:  ${process.env.TRAVELLER_SERVICE_URL || 'http://localhost:4003'} ║
║  Payment-Service:    ${process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004'}  ║
╠══════════════════════════════════════════════════╣
║  POST /auth/register    — create account         ║
║  POST /auth/login       — get JWT                ║
║  GET  /bookings         — list bookings (auth)   ║
║  POST /bookings         — create booking (auth)  ║
║  GET  /travellers       — list travellers (auth) ║
║  POST /travellers       — create traveller (auth)║
║  GET  /payments         — list payments (auth)   ║
║  POST /payments         — create payment (auth)  ║
╚══════════════════════════════════════════════════╝`
  )
})
// 4/21/2026 9:35:52 PM
// restart 04/21/2026 21:37:07
