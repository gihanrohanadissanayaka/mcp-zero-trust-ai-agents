// ── MongoDB Traveller store via Mongoose ────────────────────
import mongoose from 'mongoose'

const emergencyContactSchema = new mongoose.Schema({
  name:  { type: String, default: '' },
  phone: { type: String, default: '' }
}, { _id: false })

const travellerSchema = new mongoose.Schema({
  travellerId:      { type: String, required: true, unique: true },
  name:             { type: String, required: true },
  email:            { type: String, default: '' },
  phone:            { type: String, default: '' },
  passportNumber:   { type: String, default: '' },
  nationality:      { type: String, default: '' },
  dateOfBirth:      { type: String, default: '' },
  emergencyContact: { type: emergencyContactSchema, default: () => ({}) },
  status:           { type: String, default: 'active', enum: ['active', 'inactive'] },
  createdAt:        { type: Date, default: Date.now },
  updatedAt:        { type: Date, default: Date.now }
})

const Traveller = mongoose.models.Traveller || mongoose.model('Traveller', travellerSchema)

export async function getAllTravellers({ status, nationality } = {}) {
  const filter = {}
  if (status)      filter.status      = status
  if (nationality) filter.nationality = nationality
  return Traveller.find(filter).sort({ createdAt: -1 }).lean()
}

export async function getTravellerById(id) {
  return Traveller.findOne({ travellerId: id }).lean()
}

export async function createTraveller(data) {
  const travellerId = `traveller_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const traveller = await Traveller.create({
    travellerId,
    name:             data.name,
    email:            data.email            || '',
    phone:            data.phone            || '',
    passportNumber:   data.passportNumber   || '',
    nationality:      data.nationality      || '',
    dateOfBirth:      data.dateOfBirth      || '',
    emergencyContact: data.emergencyContact || {},
    status:           data.status           || 'active'
  })
  return traveller.toObject()
}

export async function updateTraveller(id, data) {
  const allowed = ['name', 'email', 'phone', 'passportNumber', 'nationality', 'dateOfBirth', 'emergencyContact', 'status']
  const update = {}
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key]
  }
  update.updatedAt = new Date()
  const traveller = await Traveller.findOneAndUpdate(
    { travellerId: id },
    update,
    { new: true, runValidators: true }
  ).lean()
  return traveller
}

export async function deleteTraveller(id) {
  const result = await Traveller.deleteOne({ travellerId: id })
  return result.deletedCount > 0
}
