import { validateEmail, validatePassword, validateDisplayName } from '../src/validation.js'

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const emailOk = validateEmail('test@example.com')
assert(emailOk.valid, 'validateEmail should accept valid emails')

const emailBad = validateEmail('bad-email')
assert(!emailBad.valid, 'validateEmail should reject invalid emails')

const passOk = validatePassword('hunter2pass1')
assert(passOk.valid, 'validatePassword should accept valid passwords')

const passBad = validatePassword('short')
assert(!passBad.valid, 'validatePassword should reject short passwords')

const nameOk = validateDisplayName('Player One')
assert(nameOk.valid, 'validateDisplayName should accept valid display names')

const nameBad = validateDisplayName('$$$')
assert(!nameBad.valid, 'validateDisplayName should reject invalid display names')

console.log('Smoke tests passed')
