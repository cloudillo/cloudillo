// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export class RtdbError extends Error {
	constructor(
		message: string,
		public code: number,
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
		super(message, 503, details)
		this.name = 'ConnectionError'
	}
}

export class AuthError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 401, details)
		this.name = 'AuthError'
	}
}

export class PermissionError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 403, details)
		this.name = 'PermissionError'
	}
}

export class NotFoundError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 404, details)
		this.name = 'NotFoundError'
	}
}

export class ValidationError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 400, details)
		this.name = 'ValidationError'
	}
}

export class TimeoutError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 408, details)
		this.name = 'TimeoutError'
	}
}

// vim: ts=4
