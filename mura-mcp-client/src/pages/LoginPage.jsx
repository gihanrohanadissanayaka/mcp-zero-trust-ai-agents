import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import api from '../lib/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // MCP Hub backend uses API key, not email/password login.
  // Login form accepts email+password and calls POST /api/auth/login.
  // If your backend returns an apiKey, store it. 
  // For now we also support entering an API key directly.
  const [mode, setMode] = useState('apikey') // 'apikey' | 'credentials'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'apikey') {
        // Just store the API key
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
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="text-primary" size={40} />
          </div>
          <CardTitle className="text-2xl">MCP Hub</CardTitle>
          <CardDescription>Admin Dashboard — Sign In</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('apikey')}
              className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${mode === 'apikey' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground'}`}
            >
              API Key
            </button>
            <button
              onClick={() => setMode('credentials')}
              className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${mode === 'credentials' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground'}`}
            >
              Email / Password
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'apikey' ? (
              <div className="space-y-1.5">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  placeholder="zin_xxxxxxxxxxxxxxxx"
                  value={form.apiKey || ''}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="dev@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/register" className="text-primary hover:underline">
              Register as Developer
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
