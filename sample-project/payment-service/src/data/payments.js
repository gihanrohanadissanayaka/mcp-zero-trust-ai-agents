// ── MongoDB Payment store via Mongoose ─────────────────────
import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema({
  paymentId:     { type: String, required: true, unique: true },
  travellerId:   { type: String, required: true },           // ref to traveller-service
  amount:        { type: Number, required: true, min: 0 },
  currency:      { type: String, default: 'USD', uppercase: true, trim: true },
  method:        {
    type: String,
    default: 'card',
    enum: ['card', 'bank_transfer', 'cash', 'wallet', 'other']
  },
  status:        {
    type: String,
    default: 'pending',
    enum: ['pending', 'completed', 'failed', 'refunded']
  },
  description:   { type: String, default: '' },
  referenceNo:   { type: String, default: '' },              // external transaction ref / receipt no.
  paidAt:        { type: Date,   default: null },
  createdAt:     { type: Date,   default: Date.now },
  updatedAt:     { type: Date,   default: Date.now }
})

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema)

// ── Helpers ─────────────────────────────────────────────────

export async function getAllPayments({ travellerId, status, method } = {}) {
  const filter = {}
  if (travellerId) filter.travellerId = travellerId
  if (status)      filter.status      = status
  if (method)      filter.method      = method
  return Payment.find(filter).sort({ createdAt: -1 }).lean()
}

export async function getPaymentById(id) {
  return Payment.findOne({ paymentId: id }).lean()
}

export async function createPayment(data) {
  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const payment = await Payment.create({
    paymentId,
    travellerId:  data.travellerId,
    amount:       data.amount,
    currency:     data.currency     || 'USD',
    method:       data.method       || 'card',
    status:       data.status       || 'pending',
    description:  data.description  || '',
    referenceNo:  data.referenceNo  || '',
    paidAt:       data.status === 'completed' ? new Date() : null
  })
  return payment.toObject()
}

export async function updatePayment(id, data) {
  const allowed = ['amount', 'currency', 'method', 'status', 'description', 'referenceNo', 'paidAt']
  const update = {}
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key]
  }
  // auto-stamp paidAt when status flips to completed
  if (data.status === 'completed' && !data.paidAt) update.paidAt = new Date()
  update.updatedAt = new Date()

  return Payment.findOneAndUpdate(
    { paymentId: id },
    update,
    { new: true, runValidators: true }
  ).lean()
}

export async function deletePayment(id) {
  const result = await Payment.deleteOne({ paymentId: id })
  return result.deletedCount > 0
}

export async function deletePaymentsByTraveller(travellerId) {
  const result = await Payment.deleteMany({ travellerId })
  return result.deletedCount
}

export async function getPaymentSummary(travellerId) {
  const payments = await Payment.find({ travellerId }).lean()
  const total     = payments.reduce((s, p) => s + p.amount, 0)
  const completed = payments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0)
  const pending   = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0)
  const refunded  = payments.filter(p => p.status === 'refunded').reduce((s, p) => s + p.amount, 0)
  return { travellerId, count: payments.length, total, completed, pending, refunded }
}
