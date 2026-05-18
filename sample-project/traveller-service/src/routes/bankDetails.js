// ============================================================
// traveller-service/src/routes/bankDetails.js
//
// All routes are mounted under /bank-details in index.js
//
// GET    /                          — list (filter: travellerId, accountType)
// POST   /                          — create bank detail
// DELETE /by-traveller/:travellerId — bulk delete (cascade)
// GET    /:id                       — get by ID
// PUT    /:id                       — update
// DELETE /:id                       — delete one
// ============================================================

import express from 'express'
import {
  getAllBankDetails,
  getBankDetailById,
  createBankDetail,
  updateBankDetail,
  deleteBankDetail,
  deleteBankDetailsByTraveller
} from '../data/bankDetails.js'

const router = express.Router()

// ── GET / ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { travellerId, accountType } = req.query
    const results = await getAllBankDetails({ travellerId, accountType })
    res.json({ success: true, data: { bankDetails: results, total: results.length } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── POST / ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      travellerId, accountHolderName, bankName, accountNumber,
      accountType, ifscCode, swiftCode, ibanNumber, branchName, currency, isPrimary
    } = req.body

    if (!travellerId)       return res.status(400).json({ success: false, error: 'travellerId is required' })
    if (!accountHolderName) return res.status(400).json({ success: false, error: 'accountHolderName is required' })
    if (!bankName)          return res.status(400).json({ success: false, error: 'bankName is required' })
    if (!accountNumber)     return res.status(400).json({ success: false, error: 'accountNumber is required' })

    const record = await createBankDetail({
      travellerId, accountHolderName, bankName, accountNumber,
      accountType, ifscCode, swiftCode, ibanNumber, branchName, currency, isPrimary
    })
    res.status(201).json({ success: true, message: 'Bank detail created', data: { bankDetail: record } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── DELETE /by-traveller/:travellerId ────────────────────────
// Called by the gateway cascade-delete when a traveller is removed.
router.delete('/by-traveller/:travellerId', async (req, res) => {
  try {
    const count = await deleteBankDetailsByTraveller(req.params.travellerId)
    res.json({ success: true, message: `${count} bank detail(s) deleted`, data: { deletedCount: count } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const record = await getBankDetailById(req.params.id)
    if (!record) return res.status(404).json({ success: false, error: 'Bank detail not found' })
    res.json({ success: true, data: { bankDetail: record } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── PUT /:id ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const {
      accountHolderName, bankName, accountNumber, accountType,
      ifscCode, swiftCode, ibanNumber, branchName, currency, isPrimary
    } = req.body
    const record = await updateBankDetail(req.params.id, {
      accountHolderName, bankName, accountNumber, accountType,
      ifscCode, swiftCode, ibanNumber, branchName, currency, isPrimary
    })
    if (!record) return res.status(404).json({ success: false, error: 'Bank detail not found' })
    res.json({ success: true, message: 'Bank detail updated', data: { bankDetail: record } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── DELETE /:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteBankDetail(req.params.id)
    if (!deleted) return res.status(404).json({ success: false, error: 'Bank detail not found' })
    res.json({ success: true, message: 'Bank detail deleted' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export { router }
