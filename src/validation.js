/**
 * Input Validation Utilities
 *
 * Provides validation functions to prevent XSS, injection attacks,
 * and ensure data integrity before sending to the database.
 */

/**
 * Email validation (RFC 5322 simplified)
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' }
  }

  const trimmed = email.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Email cannot be empty' }
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long' }
  }

  // Simple but effective email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' }
  }

  return { valid: true, value: trimmed }
}

/**
 * Password validation
 */
export const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' }
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password is too long (max 128 characters)' }
  }

  // Check for at least one number
  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' }
  }

  // Check for at least one letter
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one letter' }
  }

  return { valid: true, value: password }
}

/**
 * Display name validation (for user profiles)
 */
export const validateDisplayName = (name) => {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Display name is required' }
  }

  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Display name cannot be empty' }
  }

  if (trimmed.length < 2) {
    return { valid: false, error: 'Display name must be at least 2 characters' }
  }

  if (trimmed.length > 32) {
    return { valid: false, error: 'Display name cannot exceed 32 characters' }
  }

  // Only allow alphanumeric, spaces, and basic punctuation
  const allowedCharsRegex = /^[a-zA-Z0-9\s\-_'.]+$/

  if (!allowedCharsRegex.test(trimmed)) {
    return { valid: false, error: 'Display name contains invalid characters' }
  }

  // Prevent names that are just spaces or punctuation
  if (!/[a-zA-Z0-9]/.test(trimmed)) {
    return { valid: false, error: 'Display name must contain letters or numbers' }
  }

  return { valid: true, value: trimmed }
}

/**
 * Numeric value validation with range checking
 */
export const validateNumber = (value, { min = -Infinity, max = Infinity, integer = false, fieldName = 'Value' } = {}) => {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: `${fieldName} is required` }
  }

  const num = Number(value)

  if (isNaN(num)) {
    return { valid: false, error: `${fieldName} must be a valid number` }
  }

  if (!isFinite(num)) {
    return { valid: false, error: `${fieldName} must be a finite number` }
  }

  if (integer && !Number.isInteger(num)) {
    return { valid: false, error: `${fieldName} must be a whole number` }
  }

  if (num < min) {
    return { valid: false, error: `${fieldName} must be at least ${min}` }
  }

  if (num > max) {
    return { valid: false, error: `${fieldName} cannot exceed ${max}` }
  }

  return { valid: true, value: num }
}

/**
 * Character stat validation (HP, Mana, Attack, etc.)
 */
export const validateCharacterStat = (value, statName) => {
  return validateNumber(value, {
    min: 1,
    max: 9999,
    integer: true,
    fieldName: statName
  })
}

/**
 * Currency validation (soft/premium currency)
 */
export const validateCurrency = (value, currencyType = 'Currency') => {
  return validateNumber(value, {
    min: 0,
    max: 999999999, // 999 million max
    integer: true,
    fieldName: currencyType
  })
}

/**
 * XP/Level validation
 */
export const validateXP = (value) => {
  return validateNumber(value, {
    min: 0,
    max: 999999999,
    integer: true,
    fieldName: 'XP'
  })
}

export const validateLevel = (value) => {
  return validateNumber(value, {
    min: 1,
    max: 999,
    integer: true,
    fieldName: 'Level'
  })
}

/**
 * Percentage/Rate validation (0.0 to 1.0)
 */
export const validateRate = (value, fieldName = 'Rate') => {
  return validateNumber(value, {
    min: 0,
    max: 1,
    integer: false,
    fieldName
  })
}

/**
 * ID validation (positive integers only)
 */
export const validateId = (value, fieldName = 'ID') => {
  return validateNumber(value, {
    min: 1,
    max: 2147483647, // Max 32-bit integer
    integer: true,
    fieldName
  })
}

/**
 * Text content validation (descriptions, mission text, etc.)
 */
export const validateTextContent = (text, { minLength = 0, maxLength = 500, fieldName = 'Text' } = {}) => {
  if (text === null || text === undefined) {
    return { valid: false, error: `${fieldName} is required` }
  }

  if (typeof text !== 'string') {
    return { valid: false, error: `${fieldName} must be text` }
  }

  const trimmed = text.trim()

  if (trimmed.length < minLength) {
    return { valid: false, error: `${fieldName} must be at least ${minLength} characters` }
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} cannot exceed ${maxLength} characters` }
  }

  // Basic XSS prevention - check for script tags
  if (/<script|javascript:|onerror=|onload=/i.test(trimmed)) {
    return { valid: false, error: `${fieldName} contains forbidden content` }
  }

  return { valid: true, value: trimmed }
}

/**
 * URL validation
 */
export const validateURL = (url, { required = false, fieldName = 'URL' } = {}) => {
  if (!url || url.trim() === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` }
    }
    return { valid: true, value: null }
  }

  const trimmed = url.trim()

  if (trimmed.length > 2048) {
    return { valid: false, error: `${fieldName} is too long` }
  }

  try {
    const parsedUrl = new URL(trimmed)

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: `${fieldName} must use http:// or https://` }
    }

    return { valid: true, value: trimmed }
  } catch (error) {
    return { valid: false, error: `${fieldName} is not a valid URL` }
  }
}

/**
 * JSON payload validation
 */
export const validateJSON = (jsonString, { fieldName = 'JSON data' } = {}) => {
  if (!jsonString || jsonString.trim() === '') {
    return { valid: true, value: {} }
  }

  try {
    const parsed = JSON.parse(jsonString)
    return { valid: true, value: parsed }
  } catch (error) {
    return { valid: false, error: `${fieldName} must be valid JSON: ${error.message}` }
  }
}

/**
 * Date/Time validation
 */
export const validateDateTime = (dateTimeString, { required = false, fieldName = 'Date' } = {}) => {
  if (!dateTimeString || dateTimeString.trim() === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` }
    }
    return { valid: true, value: null }
  }

  const date = new Date(dateTimeString)

  if (isNaN(date.getTime())) {
    return { valid: false, error: `${fieldName} is not a valid date` }
  }

  // Check if date is reasonable (between 1970 and 2100)
  const year = date.getFullYear()
  if (year < 1970 || year > 2100) {
    return { valid: false, error: `${fieldName} must be between 1970 and 2100` }
  }

  return { valid: true, value: date.toISOString() }
}

/**
 * Enum validation
 */
export const validateEnum = (value, allowedValues, fieldName = 'Value') => {
  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      error: `${fieldName} must be one of: ${allowedValues.join(', ')}`
    }
  }

  return { valid: true, value }
}

/**
 * Character rarity validation
 */
export const validateRarity = (rarity) => {
  return validateEnum(rarity, ['R', 'SR', 'SSR', 'UR'], 'Rarity')
}

/**
 * Mission type validation
 */
export const validateMissionType = (type) => {
  return validateEnum(type, ['daily', 'weekly', 'limited'], 'Mission type')
}

/**
 * Item type validation
 */
export const validateItemType = (type) => {
  return validateEnum(type, ['character', 'shards', 'currency', 'item', 'title'], 'Item type')
}

/**
 * Batch validation helper
 * Validates multiple fields and returns all errors
 */
export const validateBatch = (validations) => {
  const errors = {}
  const values = {}
  let isValid = true

  for (const [fieldName, result] of Object.entries(validations)) {
    if (!result.valid) {
      errors[fieldName] = result.error
      isValid = false
    } else {
      values[fieldName] = result.value
    }
  }

  return { valid: isValid, errors, values }
}

/**
 * Sanitize HTML to prevent XSS
 * For display purposes only - strips all HTML tags
 */
export const sanitizeHTML = (html) => {
  if (!html || typeof html !== 'string') return ''

  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}
