// ── MongoDB User store via Mongoose ────────────────────────
import mongoose from 'mongoose'
import bcrypt   from 'bcrypt'

const userSchema = new mongoose.Schema({
  userId:       { type: String, required: true, unique: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name:         { type: String, default: '' },
  createdAt:    { type: Date,   default: Date.now }
})

const User = mongoose.models.User || mongoose.model('User', userSchema)

export async function findByEmail(email) {
  return User.findOne({ email: email.toLowerCase().trim() }).lean()
}

export async function findById(userId) {
  return User.findOne({ userId }).lean()
}

export async function createUser({ email, password, name }) {
  const existing = await findByEmail(email)
  if (existing) throw new Error('Email already registered')

  const passwordHash = await bcrypt.hash(password, 10)
  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const user = await User.create({
    userId,
    email: email.toLowerCase().trim(),
    passwordHash,
    name: name || email.split('@')[0]
  })
  return { userId: user.userId, email: user.email, name: user.name, createdAt: user.createdAt }
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash)
}

export function safeUser(user) {
  const { passwordHash, _id, __v, ...safe } = user
  return safe
}
