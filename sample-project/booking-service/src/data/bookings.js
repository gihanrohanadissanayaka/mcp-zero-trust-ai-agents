// ── MongoDB Booking store via Mongoose ─────────────────────
import mongoose from 'mongoose'

const bookingSchema = new mongoose.Schema({
  bookingId:        { type: String, required: true, unique: true },
  title:            { type: String, required: true },
  date:             { type: String, default: '' },
  attendees:        { type: [String], default: [] },
  location:         { type: String, default: '' },
  notes:            { type: String, default: '' },
  status:           { type: String, default: 'pending', enum: ['pending', 'confirmed', 'cancelled'] },
  generatedEmail:   { type: String, default: null },
  emailGeneratedAt: { type: Date,   default: null },
  createdAt:        { type: Date, default: Date.now },
  updatedAt:        { type: Date, default: Date.now }
})

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema)

export async function getAllBookings({ status, date } = {}) {
  const filter = {}
  if (status) filter.status = status
  if (date)   filter.date   = date
  return Booking.find(filter).sort({ createdAt: -1 }).lean()
}

export async function getBookingById(id) {
  return Booking.findOne({ bookingId: id }).lean()
}

export async function createBooking(data) {
  const bookingId = `booking_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const booking = await Booking.create({
    bookingId,
    title:     data.title      || 'Untitled Booking',
    date:      data.date       || new Date().toISOString().split('T')[0],
    attendees: data.attendees  || [],
    location:  data.location   || '',
    notes:     data.notes      || '',
    status:    data.status     || 'pending'
  })
  return booking.toObject()
}

export async function updateBooking(id, data) {
  const booking = await Booking.findOneAndUpdate(
    { bookingId: id },
    { ...data, updatedAt: new Date() },
    { new: true, runValidators: true }
  ).lean()
  return booking
}

export async function deleteBooking(id) {
  const result = await Booking.deleteOne({ bookingId: id })
  return result.deletedCount > 0
}

export async function saveGeneratedEmail(id, emailContent) {
  return Booking.findOneAndUpdate(
    { bookingId: id },
    { generatedEmail: emailContent, emailGeneratedAt: new Date(), updatedAt: new Date() },
    { new: true }
  ).lean()
}
