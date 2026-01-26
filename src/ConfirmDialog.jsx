import React from 'react'

/**
 * Reusable Confirmation Dialog Component
 *
 * Usage:
 * <ConfirmDialog
 *   isOpen={showDialog}
 *   title="Delete Character"
 *   message="Are you sure you want to delete Sukuna? This action cannot be undone."
 *   confirmText="Delete"
 *   cancelText="Cancel"
 *   onConfirm={() => handleDelete()}
 *   onCancel={() => setShowDialog(false)}
 *   danger={true}
 * />
 */
function ConfirmDialog({
  isOpen,
  title,
  message,
  details,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}) {
  if (!isOpen) return null

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-header">
          <h3>{title}</h3>
          <button className="confirm-close" onClick={onCancel}>×</button>
        </div>

        <div className="confirm-body">
          <p className="confirm-message">{message}</p>
          {details && <div className="confirm-details">{details}</div>}
        </div>

        <div className="confirm-actions">
          <button className="confirm-btn cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`confirm-btn ${danger ? 'danger' : 'primary'}`}
            onClick={() => {
              onConfirm()
              onCancel()
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
