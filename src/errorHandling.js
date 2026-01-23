/**
 * Error Handling Utilities
 *
 * Provides user-friendly error messages for common database and auth errors.
 * Helps translate technical error messages into actionable feedback for users.
 */

/**
 * Maps Supabase/PostgreSQL error codes to user-friendly messages
 */
const ERROR_MESSAGES = {
  // Network & Connection Errors
  'Failed to fetch': 'Unable to connect to the server. Please check your internet connection.',
  'NetworkError': 'Network error. Please check your connection and try again.',
  'ECONNREFUSED': 'Unable to reach the server. Please try again later.',

  // Authentication Errors
  'Invalid login credentials': 'Invalid email or password. Please try again.',
  'Email not confirmed': 'Please confirm your email address before signing in.',
  'User already registered': 'This email is already registered. Please sign in instead.',
  'Invalid email': 'Please enter a valid email address.',
  'Password should be at least 6 characters': 'Password must be at least 8 characters with a number and letter.',
  'signup_disabled': 'New signups are currently disabled. Please contact support.',

  // Database Errors (PostgreSQL)
  '23505': 'This record already exists. Please use a different value.',
  '23503': 'Cannot complete this action due to related records.',
  '23502': 'Required field is missing.',
  '42501': 'You do not have permission to perform this action.',
  '42P01': 'Database table not found. Please contact support.',

  // Row Level Security Errors
  'new row violates row-level security policy': 'You do not have permission to perform this action.',
  'policy': 'You do not have permission to perform this action.',

  // Rate Limiting
  'rate_limit': 'Too many requests. Please wait a moment and try again.',
  'Too many requests': 'Too many requests. Please wait a moment and try again.',

  // Generic
  'timeout': 'The request timed out. Please try again.',
  'abort': 'The request was cancelled. Please try again.',
}

/**
 * Get user-friendly error message from error object
 */
export const getUserFriendlyError = (error) => {
  if (!error) {
    return 'An unknown error occurred. Please try again.'
  }

  // If it's a string, check if it matches known errors
  if (typeof error === 'string') {
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
      if (error.includes(key)) {
        return message
      }
    }
    return error
  }

  // If it's an error object
  const errorMessage = error.message || error.error_description || error.msg || ''
  const errorCode = error.code || error.status || ''

  // Check error code first
  if (errorCode && ERROR_MESSAGES[errorCode]) {
    return ERROR_MESSAGES[errorCode]
  }

  // Check error message
  for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
    if (errorMessage.toLowerCase().includes(key.toLowerCase())) {
      return message
    }
  }

  // Check hint (PostgreSQL provides helpful hints)
  if (error.hint) {
    return `${errorMessage} (${error.hint})`
  }

  // Return original message if no match found
  return errorMessage || 'An unexpected error occurred. Please try again.'
}

/**
 * Log error to console in development, and optionally to a logging service
 */
export const logError = (error, context = {}) => {
  const isDevelopment = import.meta.env.DEV

  if (isDevelopment) {
    console.error('Error:', error)
    if (Object.keys(context).length > 0) {
      console.error('Context:', context)
    }
  }

  // TODO: Send to error logging service in production
  // Example with Sentry:
  // if (!isDevelopment && window.Sentry) {
  //   window.Sentry.captureException(error, { extra: context })
  // }
}

/**
 * Handle Supabase query errors with consistent logging and user feedback
 */
export const handleSupabaseError = (error, context = {}) => {
  logError(error, context)
  return getUserFriendlyError(error)
}

/**
 * Wrapper for Supabase operations with automatic error handling
 * Returns { data, error: userFriendlyError }
 */
export const withErrorHandling = async (operation, context = {}) => {
  try {
    const result = await operation()

    if (result.error) {
      const userError = handleSupabaseError(result.error, context)
      return { data: result.data, error: userError, rawError: result.error }
    }

    return { data: result.data, error: null, rawError: null }
  } catch (error) {
    const userError = handleSupabaseError(error, context)
    logError(error, context)
    return { data: null, error: userError, rawError: error }
  }
}

/**
 * Create a toast notification (requires toast library or custom implementation)
 * For now, this is a placeholder - you can integrate react-hot-toast or similar
 */
export const showErrorToast = (error, context = {}) => {
  const message = getUserFriendlyError(error)
  logError(error, context)

  // TODO: Replace with actual toast library
  // Example with react-hot-toast:
  // toast.error(message)

  // Fallback to alert (remove this when toast is implemented)
  if (import.meta.env.DEV) {
    console.error('Error toast:', message)
  }

  return message
}

/**
 * Specific error handlers for common operations
 */

export const handleAuthError = (error) => {
  return handleSupabaseError(error, { type: 'authentication' })
}

export const handleProfileError = (error) => {
  return handleSupabaseError(error, { type: 'profile' })
}

export const handleCharacterError = (error) => {
  return handleSupabaseError(error, { type: 'character' })
}

export const handleBattleError = (error) => {
  return handleSupabaseError(error, { type: 'battle' })
}

export const handleGachaError = (error) => {
  return handleSupabaseError(error, { type: 'gacha' })
}

export const handleShopError = (error) => {
  return handleSupabaseError(error, { type: 'shop' })
}

export const handleAdminError = (error) => {
  return handleSupabaseError(error, { type: 'admin' })
}

/**
 * Check if error is a permission/authorization error
 */
export const isPermissionError = (error) => {
  if (!error) return false

  const errorStr = typeof error === 'string' ? error : (error.message || '')

  return (
    errorStr.includes('policy') ||
    errorStr.includes('permission') ||
    errorStr.includes('42501') ||
    errorStr.includes('not authorized')
  )
}

/**
 * Check if error is a network error
 */
export const isNetworkError = (error) => {
  if (!error) return false

  const errorStr = typeof error === 'string' ? error : (error.message || '')

  return (
    errorStr.includes('fetch') ||
    errorStr.includes('network') ||
    errorStr.includes('ECONNREFUSED') ||
    errorStr.includes('offline')
  )
}

/**
 * Retry operation with exponential backoff
 */
export const retryOperation = async (
  operation,
  {
    maxRetries = 3,
    initialDelay = 1000,
    backoffFactor = 2,
    onRetry = null,
  } = {}
) => {
  let lastError = null
  let delay = initialDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation()

      // If Supabase operation returned an error
      if (result?.error) {
        // Don't retry permission errors
        if (isPermissionError(result.error)) {
          return result
        }

        // Only retry network errors
        if (!isNetworkError(result.error)) {
          return result
        }

        lastError = result.error
      } else {
        // Success
        return result
      }
    } catch (error) {
      // Don't retry permission errors
      if (isPermissionError(error)) {
        throw error
      }

      // Only retry network errors
      if (!isNetworkError(error)) {
        throw error
      }

      lastError = error
    }

    // If we're not on the last attempt, wait and retry
    if (attempt < maxRetries) {
      if (onRetry) {
        onRetry(attempt + 1, maxRetries)
      }

      await new Promise(resolve => setTimeout(resolve, delay))
      delay *= backoffFactor
    }
  }

  // All retries failed
  throw new Error(
    `Operation failed after ${maxRetries} retries: ${getUserFriendlyError(lastError)}`
  )
}
