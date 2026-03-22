import { useState, useEffect, useCallback } from 'react'
import {
  CalendarCheck, Plus, Pencil, Trash2, X, Check,
  RefreshCw, AlertCircle, CalendarDays, Clock, Users,
  Sparkles, Mail, Copy, ChevronDown, ChevronUp
} from 'lucide-react'
import { listBookings, createBooking, updateBooking, deleteBooking, generateBookingEmail } from '../lib/api'

const EMPTY_FORM = { title: '', date: '', attendees: '', location: '', notes: '', status: 'pending' }
const STATUS_COLORS = {
  confirmed: 'bg-green-100 text-green-700 border-green-200',
  pending:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Booking Form ─────────────────────────────────────────────
function BookingForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-gray-600">Title *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="Team Meeting" required
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Date</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Location</label>
          <input value={form.location} onChange={e => set('location', e.target.value)}
            placeholder="Conference Room A"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Attendees</label>
          <input value={form.attendees} onChange={e => set('attendees', e.target.value)}
            placeholder="alice@co.com, bob@co.com"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-gray-600">Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Additional details…"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave({ ...form, attendees: form.attendees.split(',').map(s => s.trim()).filter(Boolean) })}
          disabled={saving || !form.title}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
          {saving ? 'Saving…' : <><Check size={13}/> Save</>}
        </button>
        <button onClick={onCancel}
          className="flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-lg transition-colors">
          <X size={13}/> Cancel
        </button>
      </div>
    </div>
  )
}

// ── Booking Card ─────────────────────────────────────────────
function BookingCard({ booking, onEdit, onDelete, onGenerateEmail }) {
  const [deleting,     setDeleting]     = useState(false)
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState('')
  const [emailContent, setEmailContent] = useState(booking.generatedEmail || null)
  const [showEmail,    setShowEmail]    = useState(false)
  const [copied,       setCopied]       = useState(false)

  async function handleDelete() {
    if (!window.confirm(`Delete "${booking.title}"?`)) return
    setDeleting(true)
    await onDelete(booking.bookingId)
    setDeleting(false)
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenError('')
    try {
      const email = await onGenerateEmail(booking.bookingId)
      setEmailContent(email)
      setShowEmail(true)
    } catch (err) {
      setGenError(err.response?.data?.error || err.message || 'Failed to generate email')
    } finally {
      setGenerating(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(emailContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-sm truncate">{booking.title}</h3>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[booking.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {booking.status}
            </span>
            {emailContent && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200 flex items-center gap-1">
                <Sparkles size={9}/> AI Email
              </span>
            )}
          </div>

          <div className="mt-2 space-y-1 text-xs text-gray-500">
            {booking.date && (
              <div className="flex items-center gap-1.5">
                <CalendarDays size={12} className="text-indigo-400 flex-shrink-0"/>
                {fmt(booking.date)}
              </div>
            )}
            {booking.location && (
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-indigo-400 flex-shrink-0"/>
                {booking.location}
              </div>
            )}
            {booking.attendees?.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Users size={12} className="text-indigo-400 flex-shrink-0"/>
                {booking.attendees.slice(0, 3).join(', ')}
                {booking.attendees.length > 3 && ` +${booking.attendees.length - 3} more`}
              </div>
            )}
            {booking.notes && (
              <p className="text-gray-400 italic truncate mt-1">{booking.notes}</p>
            )}
          </div>
        </div>

        <div className="flex gap-1 flex-shrink-0">
          {/* AI Generate Email button */}
          <button
            onClick={emailContent ? () => setShowEmail(v => !v) : handleGenerate}
            disabled={generating}
            title={emailContent ? (showEmail ? 'Hide email' : 'Show generated email') : 'Generate email with AI'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
          >
            {generating
              ? <RefreshCw size={14} className="animate-spin"/>
              : emailContent
                ? (showEmail ? <ChevronUp size={14} className="text-purple-500"/> : <Mail size={14} className="text-purple-500"/>)
                : <Sparkles size={14}/>}
          </button>
          <button onClick={() => onEdit(booking)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Edit">
            <Pencil size={14}/>
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete">
            {deleting ? <RefreshCw size={14} className="animate-spin"/> : <Trash2 size={14}/>}
          </button>
        </div>
      </div>

      {/* Generate error */}
      {genError && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
          <AlertCircle size={12}/> {genError}
          <button onClick={() => setGenError('')} className="ml-auto"><X size={11}/></button>
        </div>
      )}

      {/* Generated Email Panel */}
      {emailContent && showEmail && (
        <div className="mt-3 border border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-purple-100 border-b border-purple-200">
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700">
              <Sparkles size={11}/> AI-Generated Email
            </div>
            <div className="flex gap-1">
              <button onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors">
                <Copy size={10}/> {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={handleGenerate} disabled={generating}
                title="Regenerate"
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50">
                <RefreshCw size={10} className={generating ? 'animate-spin' : ''}/> Regenerate
              </button>
            </div>
          </div>
          <pre className="px-3 py-2.5 text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">{emailContent}</pre>
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────
export default function BookingsPage() {
  const [bookings,  setBookings]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [creating,  setCreating]  = useState(false)
  const [editing,   setEditing]   = useState(null)   // booking object being edited
  const [saving,    setSaving]    = useState(false)
  const [filter,    setFilter]    = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await listBookings()
      setBookings(data.data?.bookings || data.bookings || [])
    } catch (err) {
      if (err.response?.status === 401) setError('Your session has expired. Please log in again.')
      else setError(err.response?.data?.error || 'Failed to load bookings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(form) {
    setSaving(true)
    try {
      await createBooking(form)
      setCreating(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create booking.')
    } finally { setSaving(false) }
  }

  async function handleUpdate(form) {
    setSaving(true)
    try {
      await updateBooking(editing.bookingId, form)
      setEditing(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update booking.')
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    try {
      await deleteBooking(id)
      setBookings(b => b.filter(x => x.bookingId !== id))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete booking.')
    }
  }

  async function handleGenerateEmail(bookingId) {
    const { data } = await generateBookingEmail(bookingId)
    const email = data.data?.emailContent || data.emailContent
    // update cached booking so the panel stays on reload
    setBookings(prev => prev.map(b => b.bookingId === bookingId
      ? { ...b, generatedEmail: email, emailGeneratedAt: new Date().toISOString() }
      : b
    ))
    return email
  }

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <CalendarCheck size={20} className="text-indigo-600"/>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bookings</h1>
            <p className="text-xs text-gray-400">{bookings.length} total</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} title="Refresh"
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={() => { setCreating(true); setEditing(null) }}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors">
            <Plus size={15}/> New Booking
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
          <AlertCircle size={15}/>
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X size={13}/></button>
        </div>
      )}

      {/* Create Form */}
      {creating && (
        <div className="mb-4">
          <BookingForm onSave={handleCreate} onCancel={() => setCreating(false)} saving={saving}/>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1.5 mb-4">
        {['all', 'confirmed', 'pending', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === s
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 bg-white'
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2"/>
          Loading bookings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <CalendarDays size={32} className="mx-auto mb-2 opacity-30"/>
          {filter === 'all' ? 'No bookings yet. Create your first one!' : `No ${filter} bookings.`}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(booking =>
            editing?.bookingId === booking.bookingId ? (
              <BookingForm key={booking.bookingId}
                initial={{ ...booking, attendees: (booking.attendees || []).join(', ') }}
                onSave={handleUpdate}
                onCancel={() => setEditing(null)}
                saving={saving}
              />
            ) : (
              <BookingCard key={booking.bookingId}
                booking={booking}
                onEdit={setEditing}
                onDelete={handleDelete}
                onGenerateEmail={handleGenerateEmail}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
