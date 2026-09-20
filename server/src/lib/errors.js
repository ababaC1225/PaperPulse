export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details = null, retryable = false } = {}) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
    this.details = details
    this.retryable = retryable
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, { status: 400, code: 'validation_error', details })
  }
}

export class NotFoundError extends AppError {
  constructor(message, details = null) {
    super(message, { status: 404, code: 'not_found', details })
  }
}

export class GoneError extends AppError {
  constructor(message, details = null) {
    super(message, { status: 410, code: 'expired', details })
  }
}

export class SourceRequestError extends AppError {
  constructor(message, { source = null, status = 502, code = 'source_request_failed', details = null, retryable = true } = {}) {
    super(message, { status, code, details, retryable })
    this.source = source
  }
}
