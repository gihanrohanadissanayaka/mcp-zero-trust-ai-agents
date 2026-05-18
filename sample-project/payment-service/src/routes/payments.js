// ============================================================
// payment-service/src/routes/payments.js
//
// GET    /                        — list payments (filter: travellerId, status, method)
// POST   /                        — create payment
// GET    /:id                     — get payment by ID
// PUT    /:id                     — update payment
// DELETE /:id                     — delete payment
// GET    /summary/:travellerId    — amount summary for a traveller
// ============================================================

import express from 'express'
import {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  deletePaymentsByTraveller,
  getPaymentSummary
} from '../data/payments.js'

const router = express.Router()

// ── GET / ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { travellerId, status, method } = req.query
    const results = await getAllPayments({ travellerId, status, method })
    res.json({ success: true, data: { payments: results, total: results.length } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── POST / ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { travellerId, amount, currency, method, status, description, referenceNo } = req.body
    if (!travellerId) return res.status(400).json({ success: false, error: 'travellerId is required' })
    if (amount == null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ success: false, error: 'amount must be a non-negative number' })
    }
    const payment = await createPayment({ travellerId, amount: Number(amount), currency, method, status, description, referenceNo })
    res.status(201).json({ success: true, message: 'Payment created', data: { payment } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── DELETE /by-traveller/:travellerId ───────────────────────
// Called by the gateway cascade-delete when a traveller is removed.
router.delete('/by-traveller/:travellerId', async (req, res) => {
  try {
    const count = await deletePaymentsByTraveller(req.params.travellerId)
    res.json({ success: true, message: `${count} payment(s) deleted`, data: { deletedCount: count } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /summary/:travellerId ────────────────────────────────
router.get('/summary/:travellerId', async (req, res) => {
  try {
    const summary = await getPaymentSummary(req.params.travellerId)
    res.json({ success: true, data: { summary } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const payment = await getPaymentById(req.params.id)
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' })
    res.json({ success: true, data: { payment } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── PUT /:id ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { amount, currency, method, status, description, referenceNo, paidAt } = req.body
    const update = { currency, method, status, description, referenceNo, paidAt }
    if (amount !== undefined) update.amount = Number(amount)
    const payment = await updatePayment(req.params.id, update)
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' })
    res.json({ success: true, message: 'Payment updated', data: { payment } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── DELETE /:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deletePayment(req.params.id)
    if (!deleted) return res.status(404).json({ success: false, error: 'Payment not found' })
    res.json({ success: true, message: 'Payment deleted' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export { router }
