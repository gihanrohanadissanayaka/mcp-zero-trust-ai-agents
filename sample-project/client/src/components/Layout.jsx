import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { CalendarCheck, LogOut, CalendarDays } from 'lucide-react'

export default function Layout() {
  const navigate = useNavigate()
  const userName = localStorage.getItem('userName') || 'User'

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
