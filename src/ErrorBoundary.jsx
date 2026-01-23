import React from 'react'
import './App.css'

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the entire app.
 *
 * This prevents the "white screen of death" when errors occur.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }))

    // TODO: Send error to logging service (e.g., Sentry, LogRocket)
    // Example:
    // logErrorToService(error, errorInfo)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })

    // Reload the page to fully reset state
    window.location.reload()
  }

  handleGoHome = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })

    // Navigate to home page
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      const isDevelopment = import.meta.env.DEV

      return (
        <div className="error-boundary-screen">
          <div className="error-boundary-panel">
            <div className="error-boundary-icon">⚠️</div>
            <h1 className="error-boundary-title">Something went wrong</h1>
            <p className="error-boundary-message">
              We encountered an unexpected error. Don't worry, your progress has been saved.
            </p>

            {isDevelopment && this.state.error && (
              <div className="error-boundary-details">
                <details>
                  <summary>Error Details (Development Only)</summary>
                  <pre className="error-boundary-stack">
                    <strong>Error:</strong> {this.state.error.toString()}
                    {'\n\n'}
                    <strong>Stack Trace:</strong>
                    {'\n'}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              </div>
            )}

            <div className="error-boundary-actions">
              <button
                className="error-boundary-btn primary"
                onClick={this.handleReset}
              >
                Reload Page
              </button>
              <button
                className="error-boundary-btn secondary"
                onClick={this.handleGoHome}
              >
                Go to Home
              </button>
            </div>

            {this.state.errorCount > 3 && (
              <div className="error-boundary-warning">
                <p>
                  <strong>Multiple errors detected.</strong> If this keeps happening, try:
                </p>
                <ul>
                  <li>Clearing your browser cache</li>
                  <li>Using a different browser</li>
                  <li>Contacting support if the issue persists</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
