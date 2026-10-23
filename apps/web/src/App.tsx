import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './pages/ChatPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { ActivityPage } from './pages/ActivityPage'
import { SystemPage } from './pages/SystemPage'
import { LoadingScreen } from './components/LoadingScreen'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/chat" replace />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:conversationId" element={<ChatPage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/system" element={<SystemPage />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  )
}