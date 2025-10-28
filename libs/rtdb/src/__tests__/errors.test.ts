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

import { describe, it, expect } from '@jest/globals'
import {
	RtdbError,
	ConnectionError,
	AuthError,
	PermissionError,
	NotFoundError,
	ValidationError,
	TimeoutError
} from '../errors'

describe('Error Classes', () => {
	describe('RtdbError', () => {
		it('should create error with code and message', () => {
			const error = new RtdbError('Test error', 500, { detail: 'info' })

			expect(error.message).toBe('Test error')
			expect(error.code).toBe(500)
			expect(error.details).toEqual({ detail: 'info' })
			expect(error.name).toBe('RtdbError')
			expect(error instanceof Error).toBe(true)
		})

		it('should have no details when not provided', () => {
			const error = new RtdbError('Test', 500)

			expect(error.details).toBeUndefined()
		})
	})

	describe('ConnectionError', () => {
		it('should have code 503', () => {
			const error = new ConnectionError('Network error')

			expect(error.code).toBe(503)
			expect(error.name).toBe('ConnectionError')
			expect(error.message).toBe('Network error')
		})

		it('should include details', () => {
			const error = new ConnectionError('Failed', { attempt: 3 })

			expect(error.details).toEqual({ attempt: 3 })
		})

		it('should be instanceof RtdbError', () => {
			const error = new ConnectionError('Test')

			expect(error instanceof RtdbError).toBe(true)
		})
	})

	describe('AuthError', () => {
		it('should have code 401', () => {
			const error = new AuthError('Invalid token')

			expect(error.code).toBe(401)
			expect(error.name).toBe('AuthError')
		})
	})

	describe('PermissionError', () => {
		it('should have code 403', () => {
			const error = new PermissionError('Access denied')

			expect(error.code).toBe(403)
			expect(error.name).toBe('PermissionError')
		})
	})

	describe('NotFoundError', () => {
		it('should have code 404', () => {
			const error = new NotFoundError('Document not found')

			expect(error.code).toBe(404)
			expect(error.name).toBe('NotFoundError')
		})
	})

	describe('ValidationError', () => {
		it('should have code 400', () => {
			const error = new ValidationError('Invalid input')

			expect(error.code).toBe(400)
			expect(error.name).toBe('ValidationError')
		})
	})

	describe('TimeoutError', () => {
		it('should have code 408', () => {
			const error = new TimeoutError('Request timeout')

			expect(error.code).toBe(408)
			expect(error.name).toBe('TimeoutError')
		})
	})

	describe('Error catching', () => {
		it('should be catchable as RtdbError', () => {
			const error = new NotFoundError('Not found')

			try {
				throw error
			} catch (e) {
				expect(e instanceof RtdbError).toBe(true)
				expect((e as RtdbError).code).toBe(404)
			}
		})

		it('should distinguish between error types', () => {
			const errors = [
				new ConnectionError('Conn'),
				new AuthError('Auth'),
				new PermissionError('Perm'),
				new NotFoundError('Not found'),
				new ValidationError('Validation'),
				new TimeoutError('Timeout')
			]

			errors.forEach((error) => {
				if (error instanceof ConnectionError) {
					expect(error.code).toBe(503)
				} else if (error instanceof AuthError) {
					expect(error.code).toBe(401)
				} else if (error instanceof PermissionError) {
					expect(error.code).toBe(403)
				} else if (error instanceof NotFoundError) {
					expect(error.code).toBe(404)
				} else if (error instanceof ValidationError) {
					expect(error.code).toBe(400)
				} else if (error instanceof TimeoutError) {
					expect(error.code).toBe(408)
				}
			})
		})
	})
})

// vim: ts=4
