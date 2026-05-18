import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout          from './components/Layout.jsx'
import LoginPage       from './pages/LoginPage.jsx'
import RegisterPage    from './pages/RegisterPage.jsx'
import BookingsPage    from './pages/BookingsPage.jsx'
import TravellersPage  from './pages/TravellersPage.jsx'
import SettingsPage    from './pages/SettingsPage.jsx'

function RequireAuth({ children }) {
  const userToken = localStorage.getItem('userToken')
  if (!userToken) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }>
          <Route index element={<Navigate to="/bookings" replace />} />
          <Route path="bookings"    element={<BookingsPage />} />
          <Route path="travellers" element={<TravellersPage />} />
          <Route path="settings"   element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/bookings" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
