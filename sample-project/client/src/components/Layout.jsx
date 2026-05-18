import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { CalendarCheck, LogOut, CalendarDays, Users, Bot, ShieldCheck, ShieldOff } from 'lucide-react'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const userName  = localStorage.getItem('userName') || 'User'
  const [hasAgent, setHasAgent] = useState(!!localStorage.getItem('agentToken'))

  // Re-read token whenever the route changes (e.g. returning from /settings)
  useEffect(() => {
    setHasAgent(!!localStorage.getItem('agentToken'))
  }, [location.pathname])

  function handleLogout() {
    localStorage.removeItem('userToken')
    localStorage.removeItem('userName')
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center">
              <CalendarDays size={15} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-800">BookingApp</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Booking Management</p>
          {/* Agent token status badge */}
          <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full w-fit ${
            hasAgent ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            {hasAgent
              ? <><ShieldCheck size={10}/> Agent token active</>
              : <><ShieldOff  size={10}/> No agent token</>}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <NavLink to="/bookings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <CalendarCheck size={16} />
            Bookings
          </NavLink>
          <NavLink to="/travellers"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <Users size={16} />
            Travellers
          </NavLink>
          <NavLink to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <Bot size={16} />
            Agent Token
          </NavLink>
        </nav>

        <div className="px-3 py-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">Signed in as</p>
          <p className="text-xs font-medium text-gray-700 truncate">{userName}</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
