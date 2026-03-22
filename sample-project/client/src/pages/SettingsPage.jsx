import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Bot, Save, CheckCircle, AlertCircle, Key, LogIn } from 'lucide-react'

export default function SettingsPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState(localStorage.getItem('agentToken') || '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function handleSave(e) {
    e.preventDefault()
    if (!token.trim()) { setError('Agent token cannot be empty.'); return }
    localStorage.setItem('agentToken', token.trim())
    setSaved(true)
    setError('')
    setTimeout(() => setSaved(false), 2500)
  }

  function handleClear() {
    setToken('')
    localStorage.removeItem('agentToken')
    localStorage.removeItem('userToken')
    localStorage.removeItem('userName')
    setSaved(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-3">
            <Bot size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Token Setup</h1>
          <p className="text-sm text-gray-500 mt-1">
            All requests are routed through your MCP Hub agent.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
          {/* Explanation */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800 space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><Key size={12}/> How to get your agent token</p>
            <ol className="list-decimal list-inside space-y-0.5 text-indigo-700">
              <li>Open the <strong>MCP Hub client</strong> at <code className="bg-indigo-100 px-1 rounded">localhost:5173</code></li>
              <li>Go to <strong>Agents</strong> and register a new agent</li>
              <li>Assign the project <code className="bg-indigo-100 px-1 rounded">proj_mn0lfpbh_35116e0432e8</code></li>
              <li>Authenticate the agent to receive an <code className="bg-indigo-100 px-1 rounded">accessToken</code></li>
              <li>Paste that token below</li>
            </ol>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                <AlertCircle size={14}/> {error}
              </div>
            )}
            {saved && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 py-2">
                <CheckCircle size={14}/> Token saved successfully!
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Agent Access Token</label>
              <textarea
                rows={4}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-400">
                Tokens expire. Re-authenticate your agent in the MCP Hub UI to get a fresh one.
              </p>
            </div>

            <div className="flex gap-2">
              <button type="submit"
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm py-2.5 rounded-lg transition-colors">
                <Save size={14}/> Save Token
              </button>
              <button type="button" onClick={handleClear}
                className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Clear
              </button>
            </div>
          </form>
        </div>

        <div className="text-center mt-4 space-y-1">
          {localStorage.getItem('userToken') ? (
            <Link to="/bookings" className="text-sm text-indigo-600 hover:underline font-medium">
              ← Back to Bookings
            </Link>
          ) : (
            <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-indigo-600 hover:underline font-medium">
              <LogIn size={14}/> Continue to Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
