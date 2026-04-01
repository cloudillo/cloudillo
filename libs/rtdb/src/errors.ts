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
		Object.setPrototypeOf(this, RtdbError.prototype)
	}
}

export class ConnectionError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 503, details)
		this.name = 'ConnectionError'
		Object.setPrototypeOf(this, ConnectionError.prototype)
	}
}

export class AuthError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 401, details)
		this.name = 'AuthError'
		Object.setPrototypeOf(this, AuthError.prototype)
	}
}

export class PermissionError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 403, details)
		this.name = 'PermissionError'
		Object.setPrototypeOf(this, PermissionError.prototype)
	}
}

export class NotFoundError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 404, details)
		this.name = 'NotFoundError'
		Object.setPrototypeOf(this, NotFoundError.prototype)
	}
}

export class ValidationError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 400, details)
		this.name = 'ValidationError'
		Object.setPrototypeOf(this, ValidationError.prototype)
	}
}

export class TimeoutError extends RtdbError {
	constructor(message: string, details?: unknown) {
		super(message, 408, details)
		this.name = 'TimeoutError'
		Object.setPrototypeOf(this, TimeoutError.prototype)
	}
}

// vim: ts=4
