import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot, Save, CheckCircle, AlertCircle, Key, LogIn,
  RefreshCw, ShieldCheck, ShieldOff, Clock, Layers,
  X, Copy, Check, EyeOff, Eye
} from 'lucide-react'
import axios from 'axios'

async function validateToken(token) {
  const res = await axios.get('/api/agent/me', {
    headers: { 'X-Agent-Token': token }
  })
  return res.data
}

export default function SettingsPage() {
  const [token,      setToken]      = useState(localStorage.getItem('agentToken') || '')
  const [validating, setValidating] = useState(false)
  const [status,     setStatus]     = useState(() =>
    localStorage.getItem('agentToken') ? 'unknown' : 'empty'
  )
  const [agentInfo,  setAgentInfo]  = useState(null)
  const [error,      setError]      = useState('')
  const [masked,     setMasked]     = useState(true)
  const [copied,     setCopied]     = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    const t = token.trim()
    if (!t) { setError('Agent token cannot be empty.'); setStatus('empty'); return }

    setValidating(true)
    setError('')
    setAgentInfo(null)
    setStatus('validating')

    try {
      const data = await validateToken(t)
      localStorage.setItem('agentToken', t)
      setAgentInfo(data)
      setStatus('valid')
    } catch (err) {
      localStorage.removeItem('agentToken')
      const msg = err.response?.data?.error || err.message
      setError(msg)
      setStatus('invalid')
    } finally {
      setValidating(false)
    }
  }

  function handleClear() {
    setToken('')
    setAgentInfo(null)
    setError('')
    setStatus('empty')
    localStorage.removeItem('agentToken')
    localStorage.removeItem('userToken')
    localStorage.removeItem('userName')
  }

  async function handleCopy() {
    if (!token.trim()) return
    await navigator.clipboard.writeText(token.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const STATUS_CFG = {
    unknown:    { bg: 'bg-gray-50 border-gray-200',      icon: <ShieldOff   size={14} className="text-gray-400"/>,                             text: 'text-gray-600',   label: 'Token saved — not yet verified' },
    validating: { bg: 'bg-violet-50 border-violet-200',  icon: <RefreshCw   size={14} className="text-violet-500 animate-spin"/>,              text: 'text-violet-700', label: 'Validating with MCP Hub…' },
    valid:      { bg: 'bg-emerald-50 border-emerald-200',icon: <ShieldCheck size={14} className="text-emerald-500"/>,                          text: 'text-emerald-700',label: 'Token is valid and active' },
    invalid:    { bg: 'bg-red-50 border-red-200',        icon: <ShieldOff   size={14} className="text-red-500"/>,                              text: 'text-red-700',    label: 'Token is invalid or expired' },
  }
  const statusCfg = STATUS_CFG[status] ?? null

  const tokenBorderCls =
    status === 'valid'   ? 'border-emerald-400 ring-emerald-100 focus-within:ring-2' :
    status === 'invalid' ? 'border-red-400 ring-red-100 focus-within:ring-2' :
    'border-gray-200 focus-within:ring-2 focus-within:ring-violet-200 focus-within:border-violet-400'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex flex-col items-center justify-center px-4 py-10">

      {/* Soft glow blob */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-violet-600/20 blur-[120px]"/>
      </div>

      <div className="relative w-full max-w-md z-10">

        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/40 mb-4">
            <Bot size={26} className="text-white"/>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Agent Token Setup</h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Authenticate your MCP Hub agent to enable API access
          </p>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/30 border border-white/10 overflow-hidden">

          {/* Card header strip */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Key size={15} className="text-white"/>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Access Token Configuration</p>
                <p className="text-violet-200 text-xs">Paste your agent token from MCP Hub</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">

            {/* How-to steps */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Key size={11} className="text-violet-500"/> How to get your token
              </p>
              <ol className="space-y-2">
                {[
                  <>Open the <strong>MCP Hub client</strong> at <code className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded text-[11px]">localhost:5173</code></>,
                  <>Go to <strong>Agents</strong> → click <strong>Get Token</strong> on your agent</>,
                  <>Enter the agent secret and click <strong>Get Token</strong></>,
                  <>Copy the <code className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded text-[11px]">accessToken</code> and paste below</>,
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <form onSubmit={handleSave} className="space-y-4">

              {/* Status banner */}
              {statusCfg && (
                <div className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${statusCfg.bg}`}>
                  {statusCfg.icon}
                  <span className={`font-medium text-xs ${statusCfg.text}`}>{statusCfg.label}</span>
                </div>
              )}

              {/* Error banner */}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3.5 py-2.5">
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-red-500"/>
                  <span className="flex-1">{error}</span>
                  <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-600 flex-shrink-0 mt-0.5">
                    <X size={12}/>
                  </button>
                </div>
              )}

              {/* Agent info on valid */}
              {status === 'valid' && agentInfo && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle size={13} className="text-emerald-600"/> Agent verified
                  </p>
                  <div className="space-y-1 text-[11px] text-emerald-700">
                    <p className="font-mono bg-emerald-100 rounded px-2 py-1 truncate">ID: {agentInfo.agentId}</p>
                    {agentInfo.allowedOperations?.length > 0 && (
                      <p className="flex items-center gap-1.5">
                        <Layers size={10} className="text-emerald-500"/>
                        Ops: {agentInfo.allowedOperations.join(', ')}
                      </p>
                    )}
                    {agentInfo.allowedProjects?.length > 0 && (
                      <p className="flex items-center gap-1.5">
                        <Key size={10} className="text-emerald-500"/>
                        Projects: {agentInfo.allowedProjects.join(', ')}
                      </p>
                    )}
                    {agentInfo.expiresAt && (
                      <p className="flex items-center gap-1.5">
                        <Clock size={10} className="text-emerald-500"/>
                        Expires: {new Date(agentInfo.expiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Token textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Agent Access Token</label>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setMasked(v => !v)}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-slate-100">
                      {masked ? <Eye size={11}/> : <EyeOff size={11}/>}
                      {masked ? 'Show' : 'Hide'}
                    </button>
                    {token && (
                      <button type="button" onClick={handleCopy}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-violet-600 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-violet-50">
                        {copied ? <Check size={11} className="text-emerald-500"/> : <Copy size={11}/>}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>
                </div>
                <div className={`relative rounded-xl border bg-white transition-all ${tokenBorderCls}`}>
                  <textarea
                    rows={4}
                    value={masked && token ? '•'.repeat(Math.min(token.length, 80)) : token}
                    onChange={e => {
                      if (masked) return
                      const v = e.target.value
                      setToken(v)
                      setStatus(v.trim() ? 'unknown' : 'empty')
                      setError('')
                      setAgentInfo(null)
                    }}
                    onFocus={() => setMasked(false)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3.5 py-3 text-xs font-mono bg-transparent focus:outline-none resize-none rounded-xl text-slate-800 placeholder:text-slate-300"
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Validated against MCP Hub before saving. Expired or revoked tokens are rejected.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-2.5 pt-1">
                <button type="submit" disabled={validating || !token.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-xl transition-all shadow-sm shadow-violet-200">
                  {validating
                    ? <><RefreshCw size={14} className="animate-spin"/> Validating…</>
                    : <><Save size={14}/> Validate &amp; Save</>
                  }
                </button>
                <button type="button" onClick={handleClear}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer nav */}
        <div className="text-center mt-5">
          {localStorage.getItem('userToken') ? (
            <Link to="/bookings"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors font-medium">
              ← Back to Bookings
            </Link>
          ) : (
            <Link to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors font-medium">
              <LogIn size={14}/> Continue to Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
