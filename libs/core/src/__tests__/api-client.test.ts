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

import { FetchError } from '../api'

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
			'E-AUTH-UNAUTH',
			'Authentication required',
			401,
			'E-AUTH-UNAUTH'
		)

		expect(error.apiErrorCode).toBe('E-AUTH-UNAUTH')
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

			expect(error.is('E-AUTH-UNAUTH')).toBe(false)
		})

		it('should not match when apiErrorCode is undefined', () => {
			const error = new FetchError('GENERIC-ERROR', 'Something went wrong', 500)

			expect(error.is('E-CORE-UNKNOWN')).toBe(false)
		})
	})
})

// vim: ts=2
