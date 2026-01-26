import React, { useEffect, useState } from 'react'

/**
 * Toast Notification System
 *
 * Usage:
 * const [toasts, setToasts] = useState([])
 *
 * const showToast = (message, type = 'success') => {
 *   const id = Date.now()
 *   setToasts(prev => [...prev, { id, message, type }])
 * }
 *
 * <ToastContainer toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
 */

function Toast({ id, message, type = 'success', onDismiss }) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onDismiss(id), 300)
    }, 3000)

    return () => clearTimeout(timer)
  }, [id, onDismiss])

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  }

  return (
    <div className={`toast toast-${type} ${isExiting ? 'toast-exit' : ''}`}>
      <span className="toast-icon">{icons[type] || icons.info}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={() => {
        setIsExiting(true)
        setTimeout(() => onDismiss(id), 300)
      }}>
        ×
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}

export default Toast
