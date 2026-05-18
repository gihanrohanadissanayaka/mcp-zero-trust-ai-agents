// ============================================================
// api.js — all calls go through the Vite proxy /api → gateway:4000
// Agent token (X-Agent-Token) is read from localStorage.
// User JWT (from auth-service login) is stored separately.
// ============================================================

import axios from 'axios'

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

// ── Attach user JWT + MCP agent token on every request ───────
http.interceptors.request.use(config => {
  const userToken  = localStorage.getItem('userToken')
  const agentToken = localStorage.getItem('agentToken')
  if (userToken)  config.headers['Authorization']  = `Bearer ${userToken}`
  if (agentToken) config.headers['X-Agent-Token']  = agentToken
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

// ── Traveller-service (via gateway → /travellers) ────────────
export const listTravellers    = (params)     => http.get('/travellers', { params })
export const getTraveller      = id           => http.get(`/travellers/${id}`)
export const createTraveller   = data         => http.post('/travellers', data)
export const updateTraveller   = (id, data)   => http.put(`/travellers/${id}`, data)
export const deleteTraveller   = id           => http.delete(`/travellers/${id}`)

// ── Traveller → Payments nested (via gateway → /travellers/:id/payments) ──
export const listTravellerPayments      = (tid)            => http.get(`/travellers/${tid}/payments`)
export const getTravellerPaymentSummary = (tid)            => http.get(`/travellers/${tid}/payments/summary`)
export const createTravellerPayment     = (tid, data)      => http.post(`/travellers/${tid}/payments`, data)
export const updateTravellerPayment     = (tid, pid, data) => http.put(`/travellers/${tid}/payments/${pid}`, data)
export const deleteTravellerPayment     = (tid, pid)       => http.delete(`/travellers/${tid}/payments/${pid}`)

// ── Traveller → Bank Details nested (via gateway → /travellers/:id/bank-details) ──
export const listTravellerBankDetails   = (tid)            => http.get(`/travellers/${tid}/bank-details`)
export const createTravellerBankDetail  = (tid, data)      => http.post(`/travellers/${tid}/bank-details`, data)
export const updateTravellerBankDetail  = (tid, bid, data) => http.put(`/travellers/${tid}/bank-details/${bid}`, data)
export const deleteTravellerBankDetail  = (tid, bid)       => http.delete(`/travellers/${tid}/bank-details/${bid}`)

