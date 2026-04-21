// ============================================================
// api.js — all calls go through the Vite proxy /api → gateway:4000
// Agent token (X-Agent-Token) is read from localStorage.
// User JWT (from auth-service login) is stored separately.
// ============================================================

import axios from 'axios'

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

// ── Attach user JWT on every request ────────────────────────
http.interceptors.request.use(config => {
  const userToken = localStorage.getItem('userToken')
  if (userToken) config.headers['Authorization'] = `Bearer ${userToken}`
  return config
})

// ── Auth-service (via gateway → /auth/*) ────────────────────
export const authRegister = data => http.post('/auth/register', data)
export const authLogin    = data => http.post('/auth/login', data)
export const authMe       = ()   => http.get('/auth/me')

// ── Booking-service (via gateway → /bookings) ───────────────
export const listBookings         = ()         => http.get('/bookings')
export const getBooking           = id         => http.get(`/bookings/${id}`)
export const createBooking        = data       => http.post('/bookings', data)
export const updateBooking        = (id, data) => http.put(`/bookings/${id}`, data)
export const deleteBooking        = id         => http.delete(`/bookings/${id}`)
export const generateBookingEmail = id         => http.post(`/bookings/${id}/generate-email`)

