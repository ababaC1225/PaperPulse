import { canonicalizeConference, normalizeYear } from '../domain/cleaning.js'
import { ValidationError } from './errors.js'

function scalarQueryValue(value, label) {
  if (value == null) return ''
  if (Array.isArray(value) || typeof value === 'object') {
    throw new ValidationError(`${label} must be provided once`)
  }
  return String(value).trim()
}

export function optionalConference(value) {
  const input = scalarQueryValue(value, 'Conference')
  if (!input) return null
  const conference = canonicalizeConference(input)
  if (!conference) throw new ValidationError('Conference must be CVPR, ICCV, or ECCV')
  return conference
}

export function optionalYear(value) {
  const input = scalarQueryValue(value, 'Year')
  if (!input) return null
  const year = normalizeYear(input)
  if (!year) throw new ValidationError('Year is invalid')
  return year
}

export function boundedInteger(value, fallback, min, max, label) {
  const input = scalarQueryValue(value, label)
  if (!input) return fallback
  const parsed = Number(input)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`)
  }
  return parsed
}
