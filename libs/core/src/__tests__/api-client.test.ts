// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { apiFetchHelper, FetchError } from '../api'

describe('apiFetchHelper envelope check', () => {
	it.each(['null', '{"foo":1}'])('rejects a 200 body without an envelope: %s', async (body) => {
		;(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
			ok: true,
			status: 200,
			text: async () => body
		})
		await expect(apiFetchHelper('user.example', 'GET', '/x', {})).rejects.toMatchObject({
			code: 'API-PARSE-JSON'
		})
	})
})

describe('FetchError', () => {
	it('should set code, descr and httpStatus', () => {
		const error = new FetchError('TEST-CODE', 'Test message', 400)

		expect(error.code).toBe('TEST-CODE')
		expect(error.descr).toBe('Test message')
		expect(error.httpStatus).toBe(400)
		expect(error.apiErrorCode).toBeUndefined()
	})

	it('should set apiErrorCode when provided', () => {
		const error = new FetchError(
			'E-AUTH-UNAUTHENTICATED',
			'Authentication required',
			401,
			'E-AUTH-UNAUTHENTICATED'
		)

		expect(error.apiErrorCode).toBe('E-AUTH-UNAUTHENTICATED')
	})

	it('should default httpStatus to 400', () => {
		const error = new FetchError('CODE', 'message')

		expect(error.httpStatus).toBe(400)
	})

	it('should extend Error with descr as message', () => {
		const error = new FetchError('CODE', 'Something went wrong', 500)

		expect(error).toBeInstanceOf(Error)
		expect(error.message).toBe('Something went wrong')
	})

	describe('is()', () => {
		it('should match when apiErrorCode equals the given code', () => {
			const error = new FetchError('E-CORE-NOTFOUND', 'Not found', 404, 'E-CORE-NOTFOUND')

			expect(error.is('E-CORE-NOTFOUND')).toBe(true)
		})

		it('should not match a different code', () => {
			const error = new FetchError('E-CORE-NOTFOUND', 'Not found', 404, 'E-CORE-NOTFOUND')

			expect(error.is('E-AUTH-UNAUTHENTICATED')).toBe(false)
		})

		it('should not match when apiErrorCode is undefined', () => {
			const error = new FetchError('GENERIC-ERROR', 'Something went wrong', 500)

			expect(error.is('E-CORE-INTERNAL')).toBe(false)
		})
	})
})

// vim: ts=2
