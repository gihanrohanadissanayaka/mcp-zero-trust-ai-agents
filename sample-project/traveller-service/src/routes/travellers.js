// ============================================================
// traveller-service/src/routes/travellers.js
//
// GET    /         — list all travellers
// POST   /         — create traveller
// GET    /:id      — get traveller by ID
// PUT    /:id      — update traveller
// DELETE /:id      — delete traveller
// ============================================================

import express from 'express'
import {
  getAllTravellers,
  getTravellerById,
  createTraveller,
  updateTraveller,
  deleteTraveller
} from '../data/travellers.js'

const router = express.Router()

// ── GET / ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, nationality } = req.query
    const results = await getAllTravellers({ status, nationality })
    res.json({ success: true, data: { travellers: results, total: results.length } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── POST / ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, passportNumber, nationality, dateOfBirth, emergencyContact, status } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'name is required' })
    const traveller = await createTraveller({ name, email, phone, passportNumber, nationality, dateOfBirth, emergencyContact, status })
    res.status(201).json({ success: true, message: 'Traveller created', data: { traveller } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const traveller = await getTravellerById(req.params.id)
    if (!traveller) return res.status(404).json({ success: false, error: 'Traveller not found' })
    res.json({ success: true, data: { traveller } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── PUT /:id ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, passportNumber, nationality, dateOfBirth, emergencyContact, status } = req.body
    const traveller = await updateTraveller(req.params.id, { name, email, phone, passportNumber, nationality, dateOfBirth, emergencyContact, status })
    if (!traveller) return res.status(404).json({ success: false, error: 'Traveller not found' })
    res.json({ success: true, message: 'Traveller updated', data: { traveller } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── DELETE /:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteTraveller(req.params.id)
    if (!deleted) return res.status(404).json({ success: false, error: 'Traveller not found' })
    res.json({ success: true, message: 'Traveller deleted' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export { router }
