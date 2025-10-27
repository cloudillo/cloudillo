// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

export class RtdbError extends Error {
	constructor(
		message: string,
		public code: number,
		public details?: any
	) {
		super(message)
		this.name = 'RtdbError'
		Object.setPrototypeOf(this, RtdbError.prototype)
	}
}

export class ConnectionError extends RtdbError {
	constructor(message: string, details?: any) {
		super(message, 503, details)
		this.name = 'ConnectionError'
		Object.setPrototypeOf(this, ConnectionError.prototype)
	}
}

export class AuthError extends RtdbError {
	constructor(message: string, details?: any) {
		super(message, 401, details)
		this.name = 'AuthError'
		Object.setPrototypeOf(this, AuthError.prototype)
	}
}

export class PermissionError extends RtdbError {
	constructor(message: string, details?: any) {
		super(message, 403, details)
		this.name = 'PermissionError'
		Object.setPrototypeOf(this, PermissionError.prototype)
	}
}

export class NotFoundError extends RtdbError {
	constructor(message: string, details?: any) {
		super(message, 404, details)
		this.name = 'NotFoundError'
		Object.setPrototypeOf(this, NotFoundError.prototype)
	}
}

export class ValidationError extends RtdbError {
	constructor(message: string, details?: any) {
		super(message, 400, details)
		this.name = 'ValidationError'
		Object.setPrototypeOf(this, ValidationError.prototype)
	}
}

export class TimeoutError extends RtdbError {
	constructor(message: string, details?: any) {
		super(message, 408, details)
		this.name = 'TimeoutError'
		Object.setPrototypeOf(this, TimeoutError.prototype)
	}
}

// vim: ts=4
