// ============================================================
// auth-service/src/index.js — User auth microservice
// PORT: 4001
// Internal service — NOT directly exposed to agents.
// Requests come from the API Gateway which validates the
// agent token before forwarding.
// ============================================================

import 'dotenv/config'
import express   from 'express'
import cors      from 'cors'
import morgan    from 'morgan'
import mongoose  from 'mongoose'
import { router } from './routes/auth.js'

const app     = express()
const PORT    = process.env.AUTH_SERVICE_PORT || 4001
const MONGO   = process.env.MONGO_URI || 'mongodb://localhost:27017/sample_project'

app.use(cors())
app.use(express.json())
app.use(morgan('[:date[iso]] AUTH :method :url :status'))

app.use('/', router)

app.use((err, _req, res, _next) => {
  console.error('[auth-service] Error:', err)
  res.status(500).json({ success: false, error: 'Internal error' })
})

mongoose.connect(MONGO)
  .then(() => {
    console.log(`[auth-service] MongoDB connected → ${MONGO}`)
    app.listen(PORT, () => {
      console.log(`[auth-service] Running on http://localhost:${PORT}`)
      console.log(`  POST /register  — create user`)
      console.log(`  POST /login     — get JWT`)
      console.log(`  GET  /me        — get profile`)
    })
  })
  .catch(err => { console.error('[auth-service] MongoDB connection failed:', err.message); process.exit(1) })
// 4/21/2026 9:35:52 PM
