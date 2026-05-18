import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Pencil, Trash2, X, Check, RefreshCw, AlertCircle,
  Phone, Mail, Globe, CreditCard, Calendar, ShieldAlert,
  ChevronDown, ChevronUp, Banknote, DollarSign,
  Building2, Star
} from 'lucide-react'
import {
  listTravellers, createTraveller, updateTraveller, deleteTraveller,
  listTravellerPayments, getTravellerPaymentSummary,
  createTravellerPayment, updateTravellerPayment, deleteTravellerPayment,
  listTravellerBankDetails, createTravellerBankDetail,
  updateTravellerBankDetail, deleteTravellerBankDetail
} from '../lib/api'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const EMPTY_TRAVELLER = {
  name: '', email: '', phone: '', passportNumber: '',
  nationality: '', dateOfBirth: '',
  emergencyContact: { name: '', phone: '' },
  status: 'active'
}

const EMPTY_PAYMENT = {
  amount: '', currency: 'USD', method: 'card',
  status: 'pending', description: '', referenceNo: ''
}

const EMPTY_BANK = {
  accountHolderName: '', bankName: '', accountNumber: '',
  accountType: 'savings', ifscCode: '', swiftCode: '',
  ibanNumber: '', branchName: '', currency: 'USD', isPrimary: false
}

const T_STATUS = {
  active:   { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
  inactive: { bar: 'bg-gray-300',   badge: 'bg-gray-100  text-gray-500   ring-1 ring-gray-200',   dot: 'bg-gray-400'   },
}

const P_STATUS = {
  completed: { colors: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  pending:   { colors: 'bg-amber-50   text-amber-700   ring-1 ring-amber-200'   },
  failed:    { colors: 'bg-red-50     text-red-700     ring-1 ring-red-200'     },
  refunded:  { colors: 'bg-violet-50  text-violet-700  ring-1 ring-violet-200'  },
}

const METHODS = ['card', 'bank_transfer', 'cash', 'wallet', 'other']
const ACCOUNT_TYPES = ['savings', 'current', 'checking', 'other']

function fmtMoney(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ─────────────────────────────────────────────────────────────
// TravellerForm  (modal overlay)
// ─────────────────────────────────────────────────────────────
function TravellerForm({ initial = EMPTY_TRAVELLER, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)
  const set   = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setEC = (k, v) => setForm(f => ({ ...f, emergencyContact: { ...f.emergencyContact, [k]: v } }))

  const inputCls = 'w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all'
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
              <Users size={16} className="text-teal-600"/>
            </div>
            <h2 className="font-semibold text-gray-900">
              {initial.name ? 'Edit Traveller' : 'New Traveller'}
            </h2>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16}/>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className={labelCls}>Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Doe" className={inputCls}/>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" className={inputCls}/>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" className={inputCls}/>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Passport Number</label>
              <input value={form.passportNumber} onChange={e => set('passportNumber', e.target.value)} placeholder="AB1234567" className={inputCls}/>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Nationality</label>
              <input value={form.nationality} onChange={e => set('nationality', e.target.value)} placeholder="American" className={inputCls}/>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} className={inputCls}/>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls + ' appearance-none'}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="pt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <ShieldAlert size={12} className="text-orange-400"/> Emergency Contact
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Contact Name</label>
                <input value={form.emergencyContact.name} onChange={e => setEC('name', e.target.value)} placeholder="Jane Doe" className={inputCls}/>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Contact Phone</label>
                <input value={form.emergencyContact.phone} onChange={e => setEC('phone', e.target.value)} placeholder="+1 555 111 2222" className={inputCls}/>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100 flex-shrink-0">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-sm shadow-teal-200">
            {saving ? <RefreshCw size={14} className="animate-spin"/> : <Check size={14}/>}
            {saving ? 'Saving...' : 'Save Traveller'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PaymentForm (inline)
// ─────────────────────────────────────────────────────────────
function PaymentForm({ initial = EMPTY_PAYMENT, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inputCls = 'w-full px-2.5 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all'

  return (
    <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 space-y-3">
      <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
        {initial.amount ? 'Edit Payment' : 'New Payment'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Amount *</label>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" className={inputCls}/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Currency</label>
          <input value={form.currency} onChange={e => set('currency', e.target.value.toUpperCase())} placeholder="USD" maxLength={3} className={inputCls}/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Method</label>
          <select value={form.method} onChange={e => set('method', e.target.value)} className={inputCls + ' appearance-none'}>
            {METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls + ' appearance-none'}>
            {['pending','completed','failed','refunded'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Description</label>
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Flight booking..." className={inputCls}/>
        </div>
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Reference No.</label>
          <input value={form.referenceNo} onChange={e => set('referenceNo', e.target.value)} placeholder="TXN-001" className={inputCls}/>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave({ ...form, amount: parseFloat(form.amount) })}
          disabled={saving || !form.amount || isNaN(parseFloat(form.amount))}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors">
          {saving ? <RefreshCw size={11} className="animate-spin"/> : <Check size={11}/>}
          {saving ? 'Saving...' : 'Save Payment'}
        </button>
        <button onClick={onCancel} className="flex items-center gap-1.5 text-xs text-gray-500 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors">
          <X size={11}/> Cancel
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PaymentPanel
// ─────────────────────────────────────────────────────────────
function PaymentPanel({ travellerId }) {
  const [payments,  setPayments]  = useState([])
  const [summary,   setSummary]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [showForm,  setShowForm]  = useState(false)
  const [editPay,   setEditPay]   = useState(null)
  const [saving,    setSaving]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [pRes, sRes] = await Promise.all([
        listTravellerPayments(travellerId),
        getTravellerPaymentSummary(travellerId)
      ])
      setPayments(pRes.data?.data?.payments || [])
      setSummary(sRes.data?.data?.summary   || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }, [travellerId])

  useEffect(() => { load() }, [load])

  async function handleSave(form) {
    setSaving(true)
    try {
      if (editPay) {
        await updateTravellerPayment(travellerId, editPay.paymentId, form)
      } else {
        await createTravellerPayment(travellerId, form)
      }
      setShowForm(false)
      setEditPay(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(pay) { setEditPay(pay); setShowForm(true) }
  function handleCancel() { setShowForm(false); setEditPay(null) }

  async function handleDelete(pid) {
    if (!window.confirm('Delete this payment?')) return
    try {
      await deleteTravellerPayment(travellerId, pid)
      setPayments(ps => ps.filter(p => p.paymentId !== pid))
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed')
    }
  }

  const formInitial = editPay
    ? { amount: editPay.amount, currency: editPay.currency, method: editPay.method,
        status: editPay.status, description: editPay.description, referenceNo: editPay.referenceNo }
    : EMPTY_PAYMENT

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
      {/* Summary chips */}
      {summary && summary.count > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Total',     val: summary.total,     cls: 'bg-gray-50 text-gray-700'       },
            { label: 'Completed', val: summary.completed, cls: 'bg-emerald-50 text-emerald-700' },
            { label: 'Pending',   val: summary.pending,   cls: 'bg-amber-50 text-amber-700'     },
          ].map(({ label, val, cls }) => (
            <div key={label} className={`${cls} rounded-xl px-3 py-2 text-center`}>
              <p className="text-xs font-bold tabular-nums">USD {fmtMoney(val)}</p>
              <p className="text-[10px] opacity-60 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl px-3 py-2">
          <AlertCircle size={11}/> <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={10}/></button>
        </div>
      )}

      {showForm && <PaymentForm initial={formInitial} onSave={handleSave} onCancel={handleCancel} saving={saving}/>}

      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2">
          <RefreshCw size={11} className="animate-spin"/> Loading payments...
        </div>
      ) : payments.length === 0 && !showForm ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 italic">No payments yet.</p>
          <button onClick={() => { setEditPay(null); setShowForm(true) }}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
            <Plus size={12}/> Add Payment
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {payments.map(p => {
              const ps = P_STATUS[p.status] || P_STATUS.pending
              return (
                <div key={p.paymentId}
                  className="group flex items-center justify-between gap-2 bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2.5 text-xs transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <Banknote size={13} className="text-indigo-400 flex-shrink-0"/>
                    <span className="font-bold text-gray-800 tabular-nums">{p.currency} {fmtMoney(p.amount)}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ps.colors}`}>
                      {p.status}
                    </span>
                    <span className="text-gray-400 hidden sm:inline capitalize">{p.method.replace('_',' ')}</span>
                    {p.description && <span className="text-gray-400 truncate hidden md:inline">{p.description}</span>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(p)} className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                      <Pencil size={11}/>
                    </button>
                    <button onClick={() => handleDelete(p.paymentId)} className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={11}/>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {!showForm && (
            <button onClick={() => { setEditPay(null); setShowForm(true) }}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
              <Plus size={12}/> Add Payment
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// BankForm
// ─────────────────────────────────────────────────────────────
function BankForm({ initial = EMPTY_BANK, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inputCls = 'w-full px-2.5 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all'

  return (
    <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
        {initial.bankName ? 'Edit Bank Detail' : 'New Bank Detail'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1 col-span-2 sm:col-span-3">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Account Holder Name *</label>
          <input value={form.accountHolderName} onChange={e => set('accountHolderName', e.target.value)} placeholder="John Doe" className={inputCls}/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Bank Name *</label>
          <input value={form.bankName} onChange={e => set('bankName', e.target.value)} placeholder="HSBC" className={inputCls}/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Account Number *</label>
          <input value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} placeholder="0001234567" className={inputCls}/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Account Type</label>
          <select value={form.accountType} onChange={e => set('accountType', e.target.value)} className={inputCls + ' appearance-none'}>
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Branch</label>
          <input value={form.branchName} onChange={e => set('branchName', e.target.value)} placeholder="Main Branch" className={inputCls}/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Currency</label>
          <input value={form.currency} onChange={e => set('currency', e.target.value.toUpperCase())} placeholder="USD" maxLength={3} className={inputCls}/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">IFSC / Routing</label>
          <input value={form.ifscCode} onChange={e => set('ifscCode', e.target.value)} placeholder="HSBC0001234" className={inputCls}/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">SWIFT / BIC</label>
          <input value={form.swiftCode} onChange={e => set('swiftCode', e.target.value)} placeholder="HSBCGB2L" className={inputCls}/>
        </div>
        <div className="space-y-1 col-span-2 sm:col-span-2">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">IBAN</label>
          <input value={form.ibanNumber} onChange={e => set('ibanNumber', e.target.value)} placeholder="GB29NWBK60161331926819" className={inputCls}/>
        </div>
        <div className="flex items-center gap-2 col-span-2 sm:col-span-3 pt-1">
          <input type="checkbox" id="isPrimary" checked={form.isPrimary}
            onChange={e => set('isPrimary', e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-blue-600"/>
          <label htmlFor="isPrimary" className="text-xs text-gray-600 cursor-pointer">Set as primary account</label>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)}
          disabled={saving || !form.accountHolderName || !form.bankName || !form.accountNumber}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors">
          {saving ? <RefreshCw size={11} className="animate-spin"/> : <Check size={11}/>}
          {saving ? 'Saving...' : 'Save Bank Detail'}
        </button>
        <button onClick={onCancel} className="flex items-center gap-1.5 text-xs text-gray-500 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors">
          <X size={11}/> Cancel
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// BankPanel
// ─────────────────────────────────────────────────────────────
function BankPanel({ travellerId }) {
  const [banks,    setBanks]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editBank, setEditBank] = useState(null)
  const [saving,   setSaving]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listTravellerBankDetails(travellerId)
      setBanks(res.data?.data?.bankDetails || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load bank details')
    } finally {
      setLoading(false)
    }
  }, [travellerId])

  useEffect(() => { load() }, [load])

  async function handleSave(form) {
    setSaving(true)
    try {
      if (editBank) {
        await updateTravellerBankDetail(travellerId, editBank.bankDetailId, form)
      } else {
        await createTravellerBankDetail(travellerId, form)
      }
      setShowForm(false)
      setEditBank(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(bank) { setEditBank(bank); setShowForm(true) }
  function handleCancel() { setShowForm(false); setEditBank(null) }

  async function handleDelete(bid) {
    if (!window.confirm('Delete this bank detail?')) return
    try {
      await deleteTravellerBankDetail(travellerId, bid)
      setBanks(bs => bs.filter(b => b.bankDetailId !== bid))
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed')
    }
  }

  const formInitial = editBank
    ? {
        accountHolderName: editBank.accountHolderName || '',
        bankName:          editBank.bankName          || '',
        accountNumber:     editBank.accountNumber     || '',
        accountType:       editBank.accountType       || 'savings',
        ifscCode:          editBank.ifscCode          || '',
        swiftCode:         editBank.swiftCode         || '',
        ibanNumber:        editBank.ibanNumber        || '',
        branchName:        editBank.branchName        || '',
        currency:          editBank.currency          || 'USD',
        isPrimary:         editBank.isPrimary         || false,
      }
    : EMPTY_BANK

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl px-3 py-2">
          <AlertCircle size={11}/> <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={10}/></button>
        </div>
      )}

      {showForm && <BankForm initial={formInitial} onSave={handleSave} onCancel={handleCancel} saving={saving}/>}

      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2">
          <RefreshCw size={11} className="animate-spin"/> Loading bank details...
        </div>
      ) : banks.length === 0 && !showForm ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 italic">No bank details yet.</p>
          <button onClick={() => { setEditBank(null); setShowForm(true) }}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
            <Plus size={12}/> Add Bank Detail
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {banks.map(b => (
              <div key={b.bankDetailId}
                className="group bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2.5 space-y-1.5 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Building2 size={13} className="text-blue-400 flex-shrink-0"/>
                    <span className="font-semibold text-gray-800 text-xs">{b.bankName}</span>
                    <span className="text-gray-500 text-xs truncate">{b.accountHolderName}</span>
                    <span className="text-gray-400 font-mono text-xs">••••{b.accountNumber.slice(-4)}</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold capitalize">
                      {b.accountType}
                    </span>
                    {b.isPrimary && (
                      <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-semibold">
                        <Star size={8} className="fill-amber-500 stroke-amber-600"/> Primary
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(b)} className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil size={11}/>
                    </button>
                    <button onClick={() => handleDelete(b.bankDetailId)} className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={11}/>
                    </button>
                  </div>
                </div>
                {(b.ifscCode || b.swiftCode || b.ibanNumber || b.branchName) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400 pl-5">
                    {b.branchName && <span>Branch: {b.branchName}</span>}
                    {b.ifscCode   && <span>IFSC: {b.ifscCode}</span>}
                    {b.swiftCode  && <span>SWIFT: {b.swiftCode}</span>}
                    {b.ibanNumber && <span>IBAN: {b.ibanNumber}</span>}
                    {b.currency   && <span>Currency: {b.currency}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
          {!showForm && (
            <button onClick={() => { setEditBank(null); setShowForm(true) }}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
              <Plus size={12}/> Add Bank Detail
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TravellerCard
// ─────────────────────────────────────────────────────────────
function TravellerCard({ traveller, onEdit, onDelete }) {
  const [deleting,     setDeleting]     = useState(false)
  const [showPayments, setShowPayments] = useState(false)
  const [showBanks,    setShowBanks]    = useState(false)

  const cfg = T_STATUS[traveller.status] || T_STATUS.inactive

  async function handleDelete() {
    if (!window.confirm(`Delete "${traveller.name}" and all their data?`)) return
    setDeleting(true)
    await onDelete(traveller.travellerId)
    setDeleting(false)
  }

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden">
      <div className="flex">
        {/* Status accent bar */}
        <div className={`w-1 flex-shrink-0 ${cfg.bar}`}/>

        <div className="flex-1 p-5">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-sm shadow-sm">
                {initials(traveller.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">{traveller.name}</h3>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
                    {traveller.status.charAt(0).toUpperCase() + traveller.status.slice(1)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-gray-500">
                  {traveller.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail size={11} className="text-teal-400 flex-shrink-0"/>
                      <span className="truncate">{traveller.email}</span>
                    </div>
                  )}
                  {traveller.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone size={11} className="text-teal-400 flex-shrink-0"/>
                      <span>{traveller.phone}</span>
                    </div>
                  )}
                  {traveller.nationality && (
                    <div className="flex items-center gap-1.5">
                      <Globe size={11} className="text-teal-400 flex-shrink-0"/>
                      <span>{traveller.nationality}</span>
                    </div>
                  )}
                  {traveller.passportNumber && (
                    <div className="flex items-center gap-1.5">
                      <CreditCard size={11} className="text-teal-400 flex-shrink-0"/>
                      <span className="font-mono">{traveller.passportNumber}</span>
                    </div>
                  )}
                  {traveller.dateOfBirth && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={11} className="text-teal-400 flex-shrink-0"/>
                      <span>{traveller.dateOfBirth}</span>
                    </div>
                  )}
                  {(traveller.emergencyContact?.name || traveller.emergencyContact?.phone) && (
                    <div className="flex items-center gap-1.5 sm:col-span-2">
                      <ShieldAlert size={11} className="text-orange-400 flex-shrink-0"/>
                      <span className="text-orange-600">
                        {[traveller.emergencyContact.name, traveller.emergencyContact.phone].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons — visible on hover */}
            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(traveller)}
                className="p-2 rounded-xl text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Edit">
                <Pencil size={14}/>
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                {deleting ? <RefreshCw size={14} className="animate-spin"/> : <Trash2 size={14}/>}
              </button>
            </div>
          </div>

          {/* Expand buttons */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-gray-50">
            <button onClick={() => setShowPayments(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors ${
                showPayments ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
              }`}>
              <DollarSign size={12}/>
              Payments
              {showPayments ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
            </button>
            <button onClick={() => setShowBanks(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors ${
                showBanks ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700'
              }`}>
              <Building2 size={12}/>
              Bank Details
              {showBanks ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
            </button>
          </div>

          {showPayments && <PaymentPanel travellerId={traveller.travellerId}/>}
          {showBanks    && <BankPanel    travellerId={traveller.travellerId}/>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TravellersPage
// ─────────────────────────────────────────────────────────────
export default function TravellersPage() {
  const [travellers,   setTravellers]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [showForm,     setShowForm]     = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const param = filterStatus === 'all' ? {} : { status: filterStatus }
      const res = await listTravellers(param)
      setTravellers(res.data?.data?.travellers || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load travellers')
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  async function handleSave(form) {
    setSaving(true)
    try {
      if (editing) {
        await updateTraveller(editing.travellerId, form)
      } else {
        await createTraveller(form)
      }
      setShowForm(false)
      setEditing(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(traveller) {
    setEditing(traveller)
    setShowForm(true)
  }

  function handleCancel() { setShowForm(false); setEditing(null) }

  async function handleDelete(id) {
    try {
      await deleteTraveller(id)
      setTravellers(ts => ts.filter(t => t.travellerId !== id))
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed')
    }
  }

  const formInitial = editing
    ? {
        name:             editing.name             || '',
        email:            editing.email            || '',
        phone:            editing.phone            || '',
        passportNumber:   editing.passportNumber   || '',
        nationality:      editing.nationality      || '',
        dateOfBirth:      editing.dateOfBirth      || '',
        emergencyContact: editing.emergencyContact || { name: '', phone: '' },
        status:           editing.status           || 'active',
      }
    : EMPTY_TRAVELLER

  const counts = {
    all:      travellers.length,
    active:   travellers.filter(t => t.status === 'active').length,
    inactive: travellers.filter(t => t.status === 'inactive').length,
  }

  const TABS = [
    { key: 'all',      label: 'All',      active: 'bg-gray-900 text-white',    inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' },
    { key: 'active',   label: 'Active',   active: 'bg-emerald-500 text-white', inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' },
    { key: 'inactive', label: 'Inactive', active: 'bg-gray-400 text-white',    inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero header */}
      <div className="bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 px-6 pt-10 pb-16">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users size={20} className="text-teal-300"/>
                <span className="text-teal-300 text-sm font-medium">Travellers</span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Profiles</h1>
              <p className="text-teal-300 text-sm mt-1">Manage traveller profiles, payments &amp; bank details</p>
            </div>
            <button
              onClick={() => { setEditing(null); setShowForm(true) }}
              className="flex items-center gap-2 bg-white text-teal-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-teal-50 transition-colors shadow-lg shadow-teal-900/20 flex-shrink-0">
              <Plus size={15}/> New Traveller
            </button>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{counts.all}</p>
              <p className="text-xs text-teal-200 mt-0.5">Total</p>
            </div>
            <div className="bg-emerald-500/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-emerald-400/30">
              <p className="text-2xl font-bold text-emerald-200 tabular-nums">{counts.active}</p>
              <p className="text-xs text-emerald-300 mt-0.5">Active</p>
            </div>
            <div className="bg-gray-500/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-gray-400/30">
              <p className="text-2xl font-bold text-gray-300 tabular-nums">{counts.inactive}</p>
              <p className="text-xs text-gray-400 mt-0.5">Inactive</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content card — overlaps gradient */}
      <div className="max-w-3xl mx-auto px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-1">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setFilterStatus(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterStatus === t.key ? t.active : t.inactive}`}>
                  {t.label}
                  <span className={`tabular-nums ${filterStatus === t.key ? 'opacity-70' : 'opacity-50'}`}>
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

          {/* Error */}
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
                <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-teal-300"/>
                <p className="text-sm">Loading travellers...</p>
              </div>
            ) : travellers.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Users size={28} className="text-gray-300"/>
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">
                  {filterStatus === 'all' ? 'No travellers yet' : `No ${filterStatus} travellers`}
                </p>
                <p className="text-xs text-gray-400">
                  {filterStatus === 'all' ? 'Add your first traveller to get started.' : 'Switch to "All" to see everyone.'}
                </p>
                {filterStatus === 'all' && (
                  <button onClick={() => setShowForm(true)}
                    className="mt-4 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                    <Plus size={14}/> Add Traveller
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {travellers.map(t => (
                  <TravellerCard
                    key={t.travellerId}
                    traveller={t}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 py-6">
          {travellers.length} traveller{travellers.length !== 1 ? 's' : ''} total
        </p>
      </div>

      {/* Modal */}
      {showForm && (
        <TravellerForm
          initial={formInitial}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
        />
      )}
    </div>
  )
}
