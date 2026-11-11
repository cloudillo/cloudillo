// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from '@jest/globals'

import {
	AuthError,
	ConnectionError,
	NotFoundError,
	PermissionError,
	RtdbError,
	TimeoutError,
	ValidationError
} from '../errors'

describe('Error Classes', () => {
	describe('RtdbError', () => {
		it('should create error with code and message', () => {
			const error = new RtdbError('Test error', 'E-CORE-INTERNAL', { detail: 'info' })

			expect(error.message).toBe('Test error')
			expect(error.code).toBe('E-CORE-INTERNAL')
			expect(error.details).toEqual({ detail: 'info' })
			expect(error.name).toBe('RtdbError')
			expect(error instanceof Error).toBe(true)
		})

		it('should have no details when not provided', () => {
			const error = new RtdbError('Test', 'E-CORE-INTERNAL')

			expect(error.details).toBeUndefined()
		})
	})

	describe('ConnectionError', () => {
		it('should have code E-CORE-UNAVAILABLE', () => {
			const error = new ConnectionError('Network error')

			expect(error.code).toBe('E-CORE-UNAVAILABLE')
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
		it('should have code E-AUTH-UNAUTHENTICATED', () => {
			const error = new AuthError('Invalid token')

			expect(error.code).toBe('E-AUTH-UNAUTHENTICATED')
			expect(error.name).toBe('AuthError')
		})
	})

	describe('PermissionError', () => {
		it('should have code E-AUTH-FORBIDDEN', () => {
			const error = new PermissionError('Access denied')

			expect(error.code).toBe('E-AUTH-FORBIDDEN')
			expect(error.name).toBe('PermissionError')
		})
	})

	describe('NotFoundError', () => {
		it('should have code E-CORE-NOTFOUND', () => {
			const error = new NotFoundError('Document not found')

			expect(error.code).toBe('E-CORE-NOTFOUND')
			expect(error.name).toBe('NotFoundError')
		})
	})

	describe('ValidationError', () => {
		it('should have code E-CORE-INVALID', () => {
			const error = new ValidationError('Invalid input')

			expect(error.code).toBe('E-CORE-INVALID')
			expect(error.name).toBe('ValidationError')
		})
	})

	describe('TimeoutError', () => {
		it('should have code E-NET-TIMEOUT', () => {
			const error = new TimeoutError('Request timeout')

			expect(error.code).toBe('E-NET-TIMEOUT')
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
				expect((e as RtdbError).code).toBe('E-CORE-NOTFOUND')
			}
		})

		it('should distinguish between error types', () => {
			const errors: RtdbError[] = [
				new ConnectionError('Conn'),
				new AuthError('Auth'),
				new PermissionError('Perm'),
				new NotFoundError('Not found'),
				new ValidationError('Validation'),
				new TimeoutError('Timeout')
			]

			errors.forEach((error) => {
				if (error instanceof ConnectionError) {
					expect(error.code).toBe('E-CORE-UNAVAILABLE')
				} else if (error instanceof AuthError) {
					expect(error.code).toBe('E-AUTH-UNAUTHENTICATED')
				} else if (error instanceof PermissionError) {
					expect(error.code).toBe('E-AUTH-FORBIDDEN')
				} else if (error instanceof NotFoundError) {
					expect(error.code).toBe('E-CORE-NOTFOUND')
				} else if (error instanceof ValidationError) {
					expect(error.code).toBe('E-CORE-INVALID')
				} else if (error instanceof TimeoutError) {
					expect(error.code).toBe('E-NET-TIMEOUT')
				}
			})
		})
	})
})

// vim: ts=4
