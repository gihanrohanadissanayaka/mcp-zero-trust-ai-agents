import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CalendarCheck, Plus, Pencil, Trash2, X, Check,
  RefreshCw, AlertCircle, CalendarDays, MapPin, Users,
  Sparkles, Mail, Copy, Cpu, Zap
} from 'lucide-react'
import { listBookings, createBooking, updateBooking, deleteBooking, generateBookingEmail } from '../lib/api'

// ── Toast ─────────────────────────────────────────────────────
function McpToast({ toast, onDismiss }) {
  const timerRef = useRef(null)

  useEffect(() => {
    if (!toast) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timerRef.current)
  }, [toast, onDismiss])

  if (!toast) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-start gap-3 bg-gray-900 text-white rounded-2xl px-4 py-3.5 shadow-2xl max-w-sm border border-white/10">
        <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles size={14} className="text-violet-400"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Email generated via AI</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              <Cpu size={10} className="text-violet-400"/>
              <span className="font-mono text-violet-300">{toast.model}</span>
            </span>
            {toast.totalTokens && (
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <Zap size={10} className="text-amber-400"/>
                {toast.totalTokens} tokens
              </span>
            )}
            {toast.durationMs && (
              <span className="text-[11px] text-gray-500">{(toast.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>
        <button onClick={onDismiss} className="text-gray-500 hover:text-white transition-colors flex-shrink-0">
          <X size={14}/>
        </button>
      </div>
    </div>
  )
}

const EMPTY_FORM = { title: '', date: '', attendees: '', location: '', notes: '', status: 'pending' }

const STATUS_CONFIG = {
  confirmed: { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
  pending:   { bar: 'bg-amber-400',   badge: 'bg-amber-50  text-amber-700  ring-1 ring-amber-200',   dot: 'bg-amber-400'   },
  cancelled: { bar: 'bg-red-400',     badge: 'bg-red-50    text-red-700    ring-1 ring-red-200',     dot: 'bg-red-400'     },
}

function fmt(dateStr) {
  if (!dateStr) return 'â€”'
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// â”€â”€ Booking Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BookingForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)
  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <CalendarCheck size={16} className="text-indigo-600"/>
            </div>
            <h2 className="font-semibold text-gray-900">
              {initial.title ? 'Edit Booking' : 'New Booking'}
            </h2>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16}/>
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="e.g. Team Standup"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all appearance-none">
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</label>
            <input value={form.location} onChange={e => set('location', e.target.value)}
              placeholder="e.g. Conference Room A"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendees</label>
            <input value={form.attendees} onChange={e => set('attendees', e.target.value)}
              placeholder="alice@co.com, bob@co.com"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
            <p className="text-[11px] text-gray-400">Separate multiple emails with commas</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Any additional detailsâ€¦"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none" />
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave({ ...form, attendees: form.attendees.split(',').map(s => s.trim()).filter(Boolean) })}
            disabled={saving || !form.title}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-sm shadow-indigo-200">
            {saving ? <RefreshCw size={14} className="animate-spin"/> : <Check size={14}/>}
            {saving ? 'Savingâ€¦' : 'Save Booking'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€ Booking Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BookingCard({ booking, onEdit, onDelete, onGenerateEmail, onToast }) {
  const [deleting,     setDeleting]     = useState(false)
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState('')
  const [emailContent, setEmailContent] = useState(booking.generatedEmail || null)
  const [showEmail,    setShowEmail]    = useState(false)
  const [copied,       setCopied]       = useState(false)

  const cfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending

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
      const { email, mcpMeta } = await onGenerateEmail(booking.bookingId)
      setEmailContent(email)
      setShowEmail(true)
      if (mcpMeta?.model) {
        onToast({
          model:       mcpMeta.model,
          totalTokens: mcpMeta.tokenUsage?.totalTokens,
          durationMs:  mcpMeta.durationMs,
        })
      }
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
    <div className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden">
      <div className="flex">
        {/* Status accent bar */}
        <div className={`w-1 flex-shrink-0 ${cfg.bar}`}/>

        <div className="flex-1 p-5">
          <div className="flex items-start justify-between gap-3">
            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap mb-3">
                <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">{booking.title}</h3>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
                  {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                </span>
                {emailContent && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                    <Sparkles size={9}/> AI Draft
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1.5 gap-x-4 text-xs text-gray-500">
                {booking.date && (
                  <div className="flex items-center gap-1.5">
                    <CalendarDays size={12} className="text-indigo-400 flex-shrink-0"/>
                    <span>{fmt(booking.date)}</span>
                  </div>
                )}
                {booking.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-indigo-400 flex-shrink-0"/>
                    <span className="truncate">{booking.location}</span>
                  </div>
                )}
                {booking.attendees?.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Users size={12} className="text-indigo-400 flex-shrink-0"/>
                    <span className="truncate">
                      {booking.attendees.slice(0, 2).join(', ')}
                      {booking.attendees.length > 2 && ` +${booking.attendees.length - 2}`}
                    </span>
                  </div>
                )}
              </div>

              {booking.notes && (
                <p className="mt-2.5 text-xs text-gray-400 italic line-clamp-2">{booking.notes}</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={emailContent ? () => setShowEmail(v => !v) : handleGenerate}
                disabled={generating}
                title={emailContent ? (showEmail ? 'Hide draft' : 'Show AI draft') : 'Generate email draft'}
                className="p-2 rounded-xl text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50">
                {generating
                  ? <RefreshCw size={14} className="animate-spin text-violet-500"/>
                  : emailContent
                    ? <Mail size={14} className="text-violet-500"/>
                    : <Sparkles size={14}/>}
              </button>
              <button onClick={() => onEdit(booking)}
                className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                <Pencil size={14}/>
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                {deleting ? <RefreshCw size={14} className="animate-spin"/> : <Trash2 size={14}/>}
              </button>
            </div>
          </div>

          {/* Error */}
          {genError && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">
              <AlertCircle size={12} className="flex-shrink-0"/>
              <span className="flex-1">{genError}</span>
              <button onClick={() => setGenError('')}><X size={11}/></button>
            </div>
          )}

          {/* AI Email Panel */}
          {emailContent && showEmail && (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-violet-100/80 border-b border-violet-200">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                  <Sparkles size={11}/> AI-Generated Draft
                </div>
                <div className="flex gap-1.5">
                  <button onClick={handleCopy}
                    className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors shadow-sm">
                    <Copy size={10}/> {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={handleGenerate} disabled={generating}
                    className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors shadow-sm disabled:opacity-50">
                    <RefreshCw size={10} className={generating ? 'animate-spin' : ''}/> Regenerate
                  </button>
                </div>
              </div>
              <pre className="px-4 py-3 text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-56 overflow-y-auto">{emailContent}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// â”€â”€ Stat Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatCard({ label, count, color }) {
  return (
    <div className={`rounded-2xl px-5 py-4 ${color} flex items-center justify-between`}>
      <span className="text-sm font-medium opacity-80">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{count}</span>
    </div>
  )
}

// â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function BookingsPage() {
  const [bookings,  setBookings]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [creating,  setCreating]  = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [filter,    setFilter]    = useState('all')
  const [toast,     setToast]     = useState(null)

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
    const email    = data.data?.emailContent || data.emailContent
    const mcpMeta  = data.mcpMeta || null
    setBookings(prev => prev.map(b => b.bookingId === bookingId
      ? { ...b, generatedEmail: email, emailGeneratedAt: new Date().toISOString() }
      : b
    ))
    return { email, mcpMeta }
  }

  const counts = {
    all:       bookings.length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    pending:   bookings.filter(b => b.status === 'pending').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  }
  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  const TABS = [
    { key: 'all',       label: 'All',       active: 'bg-gray-900 text-white',       inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' },
    { key: 'confirmed', label: 'Confirmed', active: 'bg-emerald-500 text-white',     inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' },
    { key: 'pending',   label: 'Pending',   active: 'bg-amber-400  text-white',     inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' },
    { key: 'cancelled', label: 'Cancelled', active: 'bg-red-400    text-white',     inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero header */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 pt-10 pb-16">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CalendarCheck size={20} className="text-indigo-300"/>
                <span className="text-indigo-300 text-sm font-medium">Bookings</span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Schedule</h1>
              <p className="text-indigo-300 text-sm mt-1">Manage meetings, events &amp; reservations</p>
            </div>
            <button
              onClick={() => { setCreating(true); setEditing(null) }}
              className="flex items-center gap-2 bg-white text-indigo-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg shadow-indigo-900/20 flex-shrink-0">
              <Plus size={15}/> New Booking
            </button>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{counts.all}</p>
              <p className="text-xs text-indigo-200 mt-0.5">Total</p>
            </div>
            <div className="bg-emerald-500/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-emerald-400/30">
              <p className="text-2xl font-bold text-emerald-200 tabular-nums">{counts.confirmed}</p>
              <p className="text-xs text-emerald-300 mt-0.5">Confirmed</p>
            </div>
            <div className="bg-amber-400/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-amber-300/30">
              <p className="text-2xl font-bold text-amber-200 tabular-nums">{counts.pending}</p>
              <p className="text-xs text-amber-300 mt-0.5">Pending</p>
            </div>
            <div className="bg-red-400/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-red-300/30">
              <p className="text-2xl font-bold text-red-200 tabular-nums">{counts.cancelled}</p>
              <p className="text-xs text-red-300 mt-0.5">Cancelled</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content card that overlaps the header */}
      <div className="max-w-3xl mx-auto px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            {/* Filter tabs */}
            <div className="flex items-center gap-1">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setFilter(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filter === t.key ? t.active : t.inactive}`}>
                  {t.label}
                  <span className={`tabular-nums ${filter === t.key ? 'opacity-70' : 'opacity-50'}`}>
                    {counts[t.key]}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={load} title="Refresh"
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
            </button>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-5 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle size={14} className="flex-shrink-0"/>
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X size={13}/></button>
            </div>
          )}

          {/* List */}
          <div className="p-5">
            {loading ? (
              <div className="text-center py-20 text-gray-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-indigo-300"/>
                <p className="text-sm">Loading bookingsâ€¦</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <CalendarDays size={28} className="text-gray-300"/>
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">
                  {filter === 'all' ? 'No bookings yet' : `No ${filter} bookings`}
                </p>
                <p className="text-xs text-gray-400">
                  {filter === 'all' ? 'Create your first booking to get started.' : `Switch to "All" to see everything.`}
                </p>
                {filter === 'all' && (
                  <button onClick={() => setCreating(true)}
                    className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                    <Plus size={14}/> Create Booking
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(booking => (
                  <BookingCard key={booking.bookingId}
                    booking={booking}
                    onEdit={b => { setEditing(b); setCreating(false) }}
                    onDelete={handleDelete}
                    onGenerateEmail={handleGenerateEmail}
                    onToast={setToast}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 py-6">{bookings.length} booking{bookings.length !== 1 ? 's' : ''} total</p>
      </div>

      {/* Modals */}
      {creating && (
        <BookingForm onSave={handleCreate} onCancel={() => setCreating(false)} saving={saving}/>
      )}
      {editing && (
        <BookingForm
          initial={{ ...editing, attendees: (editing.attendees || []).join(', ') }}
          onSave={handleUpdate}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      )}
      <McpToast toast={toast} onDismiss={() => setToast(null)}/>
    </div>
  )
}

