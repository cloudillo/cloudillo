// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** `code` is a backend registry code (`E-…`, `cloudillo_types::error::codes`). */
export class RtdbError extends Error {
	constructor(
		message: string,
		public code: string,
		public details?: unknown
	) {
		super(message)
		this.name = 'RtdbError'
	}
}

// Plain class declarations, not a factory: declaration emit needs to keep the
// `extends RtdbError` relationship for published consumers.

export class ConnectionError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 'E-CORE-UNAVAILABLE', details)
		this.name = 'ConnectionError'
	}
}

export class AuthError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 'E-AUTH-UNAUTHENTICATED', details)
		this.name = 'AuthError'
	}
}

export class PermissionError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 'E-AUTH-FORBIDDEN', details)
		this.name = 'PermissionError'
	}
}

export class NotFoundError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 'E-CORE-NOTFOUND', details)
		this.name = 'NotFoundError'
	}
}

export class ValidationError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 'E-CORE-INVALID', details)
		this.name = 'ValidationError'
	}
}

export class TimeoutError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 'E-NET-TIMEOUT', details)
		this.name = 'TimeoutError'
	}
}

// vim: ts=4
