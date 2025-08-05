import React from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import Dashboard from './components/Dashboard'
import Sidebar from './components/Sidebar'
import Analytics from './pages/Analytics'
import Scheduler from './pages/Scheduler'
import IdeaGenerator from './pages/IdeaGenerator'
import AccountsManager from './pages/AccountsManager'
import { PlatformProvider } from './context/PlatformContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthComponent from './components/auth/AuthComponent'

const ProtectedLayout = ({ children }) => {
  const { user, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    )
  }
  
  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="ml-64 min-h-screen">
        {children}
      </div>
    </div>
  )
}

const AppRoutes = () => {
  const { user } = useAuth()
  
  return (
    <Routes>
      <Route
        path="/login"
        element={!user ? <AuthComponent /> : <Navigate to="/" replace />}
      />
      <Route
        path="/"
        element={
          <ProtectedLayout>
            <Dashboard />
          </ProtectedLayout>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedLayout>
            <Analytics />
          </ProtectedLayout>
        }
      />
      <Route
        path="/scheduler"
        element={
          <ProtectedLayout>
            <Scheduler />
          </ProtectedLayout>
        }
      />
      <Route
        path="/ideas"
        element={
          <ProtectedLayout>
            <IdeaGenerator />
          </ProtectedLayout>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedLayout>
            <AccountsManager />
          </ProtectedLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <Router>
      <AuthProvider>
        <PlatformProvider>
          <AppRoutes />
        </PlatformProvider>
      </AuthProvider>
    </Router>
  )
}

export default App