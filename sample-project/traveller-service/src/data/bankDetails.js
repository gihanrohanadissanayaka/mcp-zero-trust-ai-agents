// ── MongoDB BankDetails store via Mongoose ──────────────────
import mongoose from 'mongoose'

const bankDetailSchema = new mongoose.Schema({
  bankDetailId:    { type: String, required: true, unique: true },
  travellerId:     { type: String, required: true, index: true },
  accountHolderName: { type: String, required: true },
  bankName:        { type: String, required: true },
  accountNumber:   { type: String, required: true },
  accountType:     {
    type: String,
    default: 'savings',
    enum: ['savings', 'current', 'checking', 'other']
  },
  ifscCode:        { type: String, default: '' },   // IFSC / routing code
  swiftCode:       { type: String, default: '' },   // SWIFT / BIC
  ibanNumber:      { type: String, default: '' },   // IBAN
  branchName:      { type: String, default: '' },
  currency:        { type: String, default: 'USD', uppercase: true, trim: true },
  isPrimary:       { type: Boolean, default: false },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now }
})

const BankDetail = mongoose.models.BankDetail || mongoose.model('BankDetail', bankDetailSchema)

// ── Helpers ──────────────────────────────────────────────────

export async function getAllBankDetails({ travellerId, accountType } = {}) {
  const filter = {}
  if (travellerId)  filter.travellerId  = travellerId
  if (accountType)  filter.accountType  = accountType
  return BankDetail.find(filter).sort({ isPrimary: -1, createdAt: -1 }).lean()
}

export async function getBankDetailById(id) {
  return BankDetail.findOne({ bankDetailId: id }).lean()
}

export async function createBankDetail(data) {
  // if this is the first record for the traveller, make it primary automatically
  const existing = await BankDetail.countDocuments({ travellerId: data.travellerId })
  const isPrimary = data.isPrimary ?? (existing === 0)

  // if explicitly marking as primary, demote others
  if (isPrimary) {
    await BankDetail.updateMany({ travellerId: data.travellerId }, { isPrimary: false })
  }

  const bankDetailId = `bank_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const record = await BankDetail.create({
    bankDetailId,
    travellerId:       data.travellerId,
    accountHolderName: data.accountHolderName,
    bankName:          data.bankName,
    accountNumber:     data.accountNumber,
    accountType:       data.accountType    || 'savings',
    ifscCode:          data.ifscCode       || '',
    swiftCode:         data.swiftCode      || '',
    ibanNumber:        data.ibanNumber     || '',
    branchName:        data.branchName     || '',
    currency:          data.currency       || 'USD',
    isPrimary
  })
  return record.toObject()
}

export async function updateBankDetail(id, data) {
  const allowed = [
    'accountHolderName', 'bankName', 'accountNumber', 'accountType',
    'ifscCode', 'swiftCode', 'ibanNumber', 'branchName', 'currency', 'isPrimary'
  ]
  const update = {}
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key]
  }

  // if promoting this record to primary, demote others for the same traveller
  if (data.isPrimary === true) {
    const current = await BankDetail.findOne({ bankDetailId: id }).lean()
    if (current) {
      await BankDetail.updateMany(
        { travellerId: current.travellerId, bankDetailId: { $ne: id } },
        { isPrimary: false }
      )
    }
  }

  update.updatedAt = new Date()
  return BankDetail.findOneAndUpdate(
    { bankDetailId: id },
    update,
    { new: true, runValidators: true }
  ).lean()
}

export async function deleteBankDetail(id) {
  const result = await BankDetail.deleteOne({ bankDetailId: id })
  return result.deletedCount > 0
}

export async function deleteBankDetailsByTraveller(travellerId) {
  const result = await BankDetail.deleteMany({ travellerId })
  return result.deletedCount
}
