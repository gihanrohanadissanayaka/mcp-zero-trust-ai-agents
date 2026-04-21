// ============================================================
// booking-service/src/index.js — Booking microservice
// PORT: 4002
// Internal service — NOT directly exposed to agents.
// Requests come from the API Gateway which validates the
// agent token before forwarding.
// ============================================================

import 'dotenv/config'
import express   from 'express'
import cors      from 'cors'
import morgan    from 'morgan'
import mongoose  from 'mongoose'
import { router } from './routes/bookings.js'

const app   = express()
const PORT  = process.env.BOOKING_SERVICE_PORT || 4002
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/sample_project'

app.use(cors())
app.use(express.json())
app.use(morgan('[:date[iso]] BOOK :method :url :status'))

app.use('/', router)

app.use((err, _req, res, _next) => {
  console.error('[booking-service] Error:', err)
  res.status(500).json({ success: false, error: 'Internal error' })
})

mongoose.connect(MONGO)
  .then(() => {
    console.log(`[booking-service] MongoDB connected → ${MONGO}`)
    app.listen(PORT, () => {
      console.log(`[booking-service] Running on http://localhost:${PORT}`)
      console.log(`  GET    /          — list bookings`)
      console.log(`  POST   /          — create booking`)
      console.log(`  GET    /:id       — get booking`)
      console.log(`  PUT    /:id       — update booking`)
      console.log(`  DELETE /:id       — delete booking`)
    })
  })
  .catch(err => { console.error('[booking-service] MongoDB connection failed:', err.message); process.exit(1) })
// 4/21/2026 9:35:52 PM

