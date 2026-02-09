import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { supabaseConfigError } from './supabaseClient'
import './index.css'

const ConfigErrorScreen = ({ message }) => (
  <div className="auth-screen">
    <div className="auth-panel">
      <h1>Configuration Required</h1>
      <p className="auth-subtitle">{message}</p>
      <div className="auth-hint">
        Update `.env` with your Supabase project URL and anon key, then restart the dev server.
      </div>
    </div>
  </div>
)

const Root = () => {
  if (supabaseConfigError) {
    return <ConfigErrorScreen message={supabaseConfigError} />
  }
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
