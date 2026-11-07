
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/theme.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { initAnalytics } from './lib/analytics'
import { watchTheme } from './lib/theme'
import './index.css'

initAnalytics()
watchTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
