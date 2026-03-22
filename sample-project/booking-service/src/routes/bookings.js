// ============================================================
// booking-service/src/routes/bookings.js
//
// GET    /         — list all bookings
// POST   /         — create booking
// GET    /:id      — get booking by ID
// PUT    /:id      — update booking
// DELETE /:id      — delete booking
// ============================================================

import express from 'express'
import {
  getAllBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
  saveGeneratedEmail
} from '../data/bookings.js'

const router  = express.Router()
const MCP_URL = () => process.env.MCP_URL || 'http://localhost:3001'

// ── GET / ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, date } = req.query
    let results = await getAllBookings({ status, date })
    res.json({ success: true, data: { bookings: results, total: results.length } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── POST / ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, date, attendees, location, notes, status } = req.body
    if (!title) return res.status(400).json({ success: false, error: 'title is required' })
    const booking = await createBooking({ title, date, attendees, location, notes, status })
    res.status(201).json({ success: true, message: 'Booking created', data: { booking } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const booking = await getBookingById(req.params.id)
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' })
    res.json({ success: true, data: { booking } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── PUT /:id ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { title, date, attendees, location, notes, status } = req.body
    const booking = await updateBooking(req.params.id, { title, date, attendees, location, notes, status })
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' })
    res.json({ success: true, message: 'Booking updated', data: { booking } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── DELETE /:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteBooking(req.params.id)
    if (!deleted) return res.status(404).json({ success: false, error: 'Booking not found' })
    res.json({ success: true, message: 'Booking deleted' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── POST /:id/generate-email ──────────────────────────────────
router.post('/:id/generate-email', async (req, res) => {
  try {
    const booking = await getBookingById(req.params.id)
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' })

    const mcpApiKey = process.env.MCP_API_KEY
    if (!mcpApiKey || mcpApiKey === 'your_mcphub_api_key_here') {
      return res.status(503).json({
        success: false,
        error:   'MCP_API_KEY not configured. Add your MCP Hub API key to booking-service/.env'
      })
    }

    // ── Delegate to MCP ──────────────────────────────────
    const mcpRes = await fetch(`${MCP_URL()}/api/tools/invoke`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${mcpApiKey}`
      },
      body: JSON.stringify({
        tool:      'generate_email',
        projectId: process.env.MCP_PROJECT_ID || undefined,
        input: {
          bookingId: booking.bookingId,
          title:     booking.title,
          date:      booking.date,
          location:  booking.location,
          attendees: booking.attendees,
          notes:     booking.notes,
          status:    booking.status
        }
      })
    })

    const mcpBody = await mcpRes.json()

    if (!mcpRes.ok || !mcpBody.success) {
      return res.status(mcpRes.status || 502).json({
        success: false,
        error:   mcpBody.error || 'MCP tool invocation failed'
      })
    }

    const emailContent = mcpBody.result
    const updated = await saveGeneratedEmail(booking.bookingId, emailContent)

    res.json({
      success: true,
      message: 'Email generated via MCP and saved',
      data:    { booking: updated, emailContent },
      mcpMeta: mcpBody.meta
    })

  } catch (err) {
    console.error('[booking-service] generate-email error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET / health  ─────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ service: 'booking-service', status: 'ok' })
})

export { router }
