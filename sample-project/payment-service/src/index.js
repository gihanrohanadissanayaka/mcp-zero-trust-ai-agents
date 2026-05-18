// ============================================================
// payment-service/src/index.js — Payment microservice
// PORT: 4004
// Internal service — NOT directly exposed to agents.
// Requests come from the API Gateway which validates the
// agent token before forwarding.
// ============================================================

import 'dotenv/config'
import express  from 'express'
import cors     from 'cors'
import morgan   from 'morgan'
import mongoose from 'mongoose'
import { router } from './routes/payments.js'

const app   = express()
const PORT  = process.env.PAYMENT_SERVICE_PORT || process.env.PORT || 4004
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/sample_project'

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:4000']
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('CORS: origin not allowed'))
  },
  credentials: true,
}))
app.use(express.json())
app.use(morgan('[:date[iso]] PAYMENT :method :url :status'))

app.use('/', router)

app.use((err, _req, res, _next) => {
  console.error('[payment-service] Error:', err)
  res.status(500).json({ success: false, error: 'Internal error' })
})

mongoose.connect(MONGO)
  .then(() => {
    console.log(`[payment-service] MongoDB connected → ${MONGO}`)
    app.listen(PORT, () => {
      console.log(`[payment-service] Running on http://localhost:${PORT}`)
      console.log(`  GET    /                          — list payments`)
      console.log(`  POST   /                          — create payment`)
      console.log(`  GET    /summary/:travellerId       — traveller payment summary`)
      console.log(`  DELETE /by-traveller/:travellerId  — bulk-delete (cascade)`)
      console.log(`  GET    /:id                        — get payment`)
      console.log(`  PUT    /:id                        — update payment`)
      console.log(`  DELETE /:id                        — delete payment`)
    })
  })
  .catch(err => { console.error('[payment-service] MongoDB connection failed:', err.message); process.exit(1) })
