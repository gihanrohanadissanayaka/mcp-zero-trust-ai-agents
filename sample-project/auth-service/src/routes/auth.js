// ============================================================
// auth-service/src/routes/auth.js
// POST /register  — create account
// POST /login     — get JWT
// GET  /me        — profile (requires Authorization: Bearer <jwt>)
// ============================================================

import express from 'express'
import jwt     from 'jsonwebtoken'
import { createUser, findByEmail, verifyPassword, safeUser, findById } from '../data/users.js'

const router     = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'auth-service-dev-secret'
const JWT_EXPIRY = '8h'

// ── POST /register ───────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password are required' })
    }
    const user = await createUser({ email, password, name })
    res.status(201).json({ success: true, message: 'User registered', data: { user } })
  } catch (err) {
    res.status(409).json({ success: false, error: err.message })
  }
})

// ── POST /login ──────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password are required' })
    }
    const user = await findByEmail(email)
    if (!user || !(await verifyPassword(user, password))) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' })
    }
    const token = jwt.sign({ sub: user.userId, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY })
    res.json({
      success: true,
      message: 'Login successful',
      data:    { token, user: safeUser(user) }
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /me ──────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Bearer token required' })
    }
    const payload = jwt.verify(authHeader.substring(7), JWT_SECRET)
    const user    = await findById(payload.sub)
    if (!user) return res.status(404).json({ success: false, error: 'User not found' })
    res.json({ success: true, data: { user: safeUser(user) } })
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }
})

// ── GET / health ─────────────────────────────────────────────
router.get('/', (_req, res) => {
  res.json({ service: 'auth-service', status: 'ok' })
})

export { router }
