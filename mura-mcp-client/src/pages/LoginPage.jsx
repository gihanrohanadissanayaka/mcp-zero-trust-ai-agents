import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, Eye, EyeOff, Bot, Key, BarChart3,
  Layers, Lock, Zap, CheckCircle2, ArrowRight,
} from 'lucide-react'
import api from '../lib/api'

const FEATURES = [
  {
    icon: Bot,
    color: 'bg-indigo-500/20 text-indigo-300',
    title: 'AI Agent Registry',
    desc:  'Register, manage, and authenticate AI agents with unique identities and scoped credentials.',
  },
  {
    icon: ShieldCheck,
    color: 'bg-violet-500/20 text-violet-300',
    title: 'Zero-Trust Policy Engine',
    desc:  'Define per-agent rules — allowed tools, projects, operations, time windows. Default deny, first-match wins.',
  },
  {
    icon: Lock,
    color: 'bg-emerald-500/20 text-emerald-300',
    title: 'JWT Session Tokens',
    desc:  'Short-lived signed tokens with configurable duration up to 1 week. Refresh token rotation included.',
  },
  {
    icon: Layers,
    color: 'bg-sky-500/20 text-sky-300',
    title: 'Tool Invocation Gateway',
    desc:  'Proxy AI tool calls (Groq, LLMs) through MCP with project-scoped API key auth and policy enforcement.',
  },
  {
    icon: BarChart3,
    color: 'bg-amber-500/20 text-amber-300',
    title: 'Full Audit Logging',
    desc:  'Every session, tool call, and denied access is logged to MongoDB with duration, IP, and policy context.',
  },
  {
    icon: Zap,
    color: 'bg-rose-500/20 text-rose-300',
    title: 'Rate Limiting',
    desc:  'Sliding-window rate limiter per agent with configurable request-per-minute thresholds.',
  },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('apikey') // 'apikey' | 'credentials'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'apikey') {
        if (!form.apiKey?.trim()) { setError('API key is required'); setLoading(false); return }
        localStorage.setItem('apiKey', form.apiKey.trim())
        navigate('/')
      } else {
        const { data } = await api.post('/auth/login', { email: form.email, password: form.password })
        if (data.apiKey) {
          localStorage.setItem('apiKey', data.apiKey)
          localStorage.setItem('developerName', data.name || '')
          navigate('/')
        } else {
          setError('Login failed: no API key returned')
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-gray-950">

      {/* ── LEFT: Product pitch ── */}
      <div className="hidden lg:flex flex-col justify-between w-[58%] bg-gradient-to-br from-indigo-950 via-gray-950 to-violet-950 px-14 py-12 border-r border-white/5 relative overflow-hidden">

        {/* Background glow blobs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"/>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-violet-600/15 rounded-full blur-3xl pointer-events-none"/>

        {/* Logo + title */}
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900">
              <ShieldCheck size={20} className="text-white"/>
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-none">MCP Hub</p>
              <p className="text-indigo-400 text-[11px] font-medium tracking-widest uppercase">Zero-Trust AI Gateway</p>
            </div>
            <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
              <CheckCircle2 size={10}/> Production Ready
            </span>
          </div>

          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Control every AI agent.<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
              Trust nothing. Verify everything.
            </span>
          </h1>
          <p className="text-gray-400 text-base leading-relaxed max-w-md mb-10">
            MCP Hub is a production-grade middleware platform for securing, governing, and auditing AI agent activity across your microservices — built on Zero Trust principles.
          </p>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="flex gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon size={15}/>
                </div>
                <div>
                  <p className="text-white text-xs font-semibold mb-0.5">{title}</p>
                  <p className="text-gray-500 text-[11px] leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stat bar */}
        <div className="flex items-center gap-8 mt-10 pt-8 border-t border-white/[0.07]">
          {[
            { value: 'JWT', label: 'HS256 Signed Tokens' },
            { value: 'Groq', label: 'LLM Provider' },
            { value: 'MongoDB', label: 'Audit Store' },
            { value: 'REST', label: 'Agent + Tool APIs' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-white font-bold text-sm">{s.value}</p>
              <p className="text-gray-500 text-[11px]">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Login form ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-950">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <ShieldCheck size={18} className="text-white"/>
            </div>
            <div>
              <p className="text-white font-bold">MCP Hub</p>
              <p className="text-indigo-400 text-[11px] tracking-widest uppercase">Zero-Trust AI Gateway</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Sign in</h2>
          <p className="text-gray-500 text-sm mb-8">Access your developer dashboard</p>

          {/* Mode toggle */}
          <div className="flex gap-1 mb-6 p-1 bg-white/[0.05] rounded-xl border border-white/[0.08]">
            {[
              { id: 'apikey', label: 'API Key', icon: Key },
              { id: 'credentials', label: 'Email / Password', icon: ShieldCheck },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setMode(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  mode === id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900'
                    : 'text-gray-400 hover:text-gray-200'
                }`}>
                <Icon size={12}/>{label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'apikey' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Developer API Key</label>
                <input
                  type="password"
                  placeholder="zin_xxxxxxxxxxxxxxxx"
                  value={form.apiKey || ''}
                  onChange={e => setForm({ ...form, apiKey: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.10] text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all font-mono"
                />
                <p className="text-[11px] text-gray-600">Your API key was shown once during developer registration.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    placeholder="dev@example.com"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.10] text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className="w-full px-4 py-3 pr-11 rounded-xl bg-white/[0.05] border border-white/[0.10] text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-gray-500 hover:text-gray-300 transition-colors">
                      {showPassword ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-900/50">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Signing in…</>
                : <>Sign In <ArrowRight size={15}/></>}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-600">
            No account?{' '}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Register as Developer
            </Link>
          </p>

          {/* Production badge (mobile) */}
          <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-gray-600 lg:hidden">
            <CheckCircle2 size={11} className="text-emerald-500"/>
            Production-ready · Zero Trust · JWT · MongoDB
          </div>
        </div>
      </div>
    </div>
  )
}
