// ============================================================
// traveller-service/src/index.js — Traveller microservice
// PORT: 4003
// Internal service — NOT directly exposed to agents.
// Requests come from the API Gateway which validates the
// agent token before forwarding.
// ============================================================

import 'dotenv/config'
import express  from 'express'
import cors     from 'cors'
import morgan   from 'morgan'
import mongoose from 'mongoose'
import { router }            from './routes/travellers.js'
import { router as bankRouter } from './routes/bankDetails.js'

const app   = express()
const PORT  = process.env.TRAVELLER_SERVICE_PORT || process.env.PORT || 4003
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
app.use(morgan('[:date[iso]] TRAVELLER :method :url :status'))

// bank-details MUST be mounted before '/' travellers router,
// because router's GET /:id would otherwise swallow /bank-details as an id.
app.use('/bank-details', bankRouter)
app.use('/', router)

app.use((err, _req, res, _next) => {
  console.error('[traveller-service] Error:', err)
  res.status(500).json({ success: false, error: 'Internal error' })
})

mongoose.connect(MONGO)
  .then(() => {
    console.log(`[traveller-service] MongoDB connected → ${MONGO}`)
    app.listen(PORT, () => {
      console.log(`[traveller-service] Running on http://localhost:${PORT}`)
      console.log(`  GET    /                                    — list travellers`)
      console.log(`  POST   /                                    — create traveller`)
      console.log(`  GET    /:id                                 — get traveller`)
      console.log(`  PUT    /:id                                 — update traveller`)
      console.log(`  DELETE /:id                                 — delete traveller`)
      console.log(`  GET    /bank-details                        — list bank details`)
      console.log(`  POST   /bank-details                        — create bank detail`)
      console.log(`  DELETE /bank-details/by-traveller/:id       — bulk delete (cascade)`)
      console.log(`  GET    /bank-details/:id                    — get bank detail`)
      console.log(`  PUT    /bank-details/:id                    — update bank detail`)
      console.log(`  DELETE /bank-details/:id                    — delete bank detail`)
    })
  })
  .catch(err => { console.error('[traveller-service] MongoDB connection failed:', err.message); process.exit(1) })
