import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach API key from localStorage on every request
api.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('apiKey')
  if (apiKey) {
    config.headers['Authorization'] = `Bearer ${apiKey}`
    config.headers['X-API-Key'] = apiKey  // keep for backwards compat
  }
  return config
})

// Auth
export const register = (data) => api.post('/auth/register', data)
export const login = (data) => api.post('/auth/login', data)

// Agents
export const listAgents         = ()       => api.get('/agents')
export const getAgent           = (id)     => api.get(`/agents/${id}`)
export const registerAgent      = (data)   => api.post('/agents/register', data)
export const updateAgent        = (id, data) => api.patch(`/agents/${id}`, data)
export const deactivateAgent    = (id)     => api.delete(`/agents/${id}`)
export const rotateAgentSecret  = (id)     => api.post(`/agents/${id}/rotate-secret`)
export const listAgentSessions  = (id)     => api.get(`/agents/${id}/sessions`)
export const revokeAgentSessions= (id)     => api.delete(`/agents/${id}/sessions`)

// Agent authenticate / tokens
export const authenticateAgent = (data) => api.post('/agents/authenticate', data)
export const introspectToken = (data) => api.post('/agents/introspect', data)
export const revokeSession = (data) => api.post('/agents/revoke-session', data)

// Policy
export const getAgentPolicy = (id) => api.get(`/agents/${id}/policy`)
export const addPolicyRule = (id, rule) => api.post(`/agents/${id}/policy/rules`, rule)
export const removePolicyRule = (id, ruleId) => api.delete(`/agents/${id}/policy/rules/${ruleId}`)
export const replacePolicyRules = (id, rules) => api.put(`/agents/${id}/policy/rules`, { rules })
export const simulatePolicy = (id, data) => api.post(`/agents/${id}/policy/simulate`, data)

// Projects
export const listProjects            = ()           => api.get('/projects')
export const getProject              = (id)         => api.get(`/projects/${id}`)
export const createProject           = (data)       => api.post('/projects', data)
export const updateProject           = (id, data)   => api.put(`/projects/${id}`, data)
export const deleteProject           = (id)         => api.delete(`/projects/${id}`)
export const checkProjectConnectivity = (id)        => api.get(`/projects/${id}/connectivity`)

// Logs
export const listLogs   = (params) => api.get('/logs',         { params })
export const getLog     = (logId)  => api.get(`/logs/${logId}`)
export const getLogs    = listLogs
export const getLogStats = (params) => api.get('/logs/stats',  { params })

export default api
