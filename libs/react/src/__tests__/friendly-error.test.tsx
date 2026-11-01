// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `friendlyError`: one case per mapping branch, and the backend `descr` never leaks.
 * `LoadError`: title, description and Retry.
 */

import { FetchError } from '@cloudillo/core'
import {
	AuthError,
	ConnectionError,
	NotFoundError,
	PermissionError,
	TimeoutError,
	ValidationError
} from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { friendlyError, LoadError } from '../errors.js'

const t = (key: string) => key

let online = true
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })

const fetchErr = (httpStatus: number, apiErrorCode?: string) =>
	new FetchError('ERR', 'SQL boom', httpStatus, apiErrorCode)

const OFFLINE = 'You appear to be offline. Check your connection and try again.'
const UNREACHABLE = "Couldn't reach the server. Check your connection and try again."
const QUOTA = 'Not enough storage space.'
const RATE = 'Too many requests. Wait a moment and try again.'
const REMOTE = "Couldn't reach the other server. Try again later."
const INVALID = 'Some of the information is not valid.'
const SESSION = 'Your session has expired. Sign in again.'
const FORBIDDEN = "You don't have permission to do this."
const GONE = 'This item no longer exists.'
const GENERIC = 'Something went wrong. Try again.'

describe('friendlyError', () => {
	beforeEach(() => {
		online = true
	})

	it('reports offline first, whatever the error', () => {
		online = false
		expect(friendlyError(t, fetchErr(500))).toBe(OFFLINE)
	})

	it('maps a fetch TypeError and rtdb connection/timeout errors to unreachable', () => {
		expect(friendlyError(t, new TypeError('Failed to fetch'))).toBe(UNREACHABLE)
		expect(friendlyError(t, new ConnectionError('closed'))).toBe(UNREACHABLE)
		expect(friendlyError(t, new TimeoutError('timeout'))).toBe(UNREACHABLE)
	})

	it.each([
		['E-FILE-QUOTA', QUOTA],
		['E-RATE-LIMITED', RATE],
		['E-RATE-BANNED', RATE],
		['E-FILE-SRCUNREACH', REMOTE],
		['E-NET-TIMEOUT', REMOTE],
		['E-NET-ERROR', REMOTE],
		['E-VAL-INVALID', INVALID]
	])('maps apiErrorCode %s before the status', (code, msg) => {
		expect(friendlyError(t, fetchErr(400, code))).toBe(msg)
	})

	it.each([
		[401, SESSION],
		[403, FORBIDDEN],
		[404, GONE],
		[409, 'This was changed in the meantime. Reload and try again.'],
		[413, 'This is too large to upload.'],
		[429, RATE],
		[507, QUOTA],
		[500, 'Something went wrong on the server. Try again later.'],
		[503, 'Something went wrong on the server. Try again later.'],
		[418, GENERIC]
	])('maps HTTP %d', (status, msg) => {
		expect(friendlyError(t, fetchErr(status))).toBe(msg)
	})

	it('maps rtdb auth/permission/not-found/validation errors', () => {
		expect(friendlyError(t, new AuthError('x'))).toBe(SESSION)
		expect(friendlyError(t, new PermissionError('x'))).toBe(FORBIDDEN)
		expect(friendlyError(t, new NotFoundError('x'))).toBe(GONE)
		expect(friendlyError(t, new ValidationError('x'))).toBe(INVALID)
	})

	it('falls back to a generic sentence', () => {
		expect(friendlyError(t, new Error('boom'))).toBe(GENERIC)
		expect(friendlyError(t, 'str')).toBe(GENERIC)
		expect(friendlyError(t, undefined)).toBe(GENERIC)
	})

	it('never shows the backend descr', () => {
		for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 507]) {
			expect(friendlyError(t, fetchErr(status))).not.toContain('SQL boom')
		}
		expect(friendlyError(t, fetchErr(400, 'E-SOMETHING-ELSE'))).not.toContain('SQL boom')
	})
})

describe('LoadError', () => {
	beforeEach(() => {
		online = true
	})

	it('shows the title, the friendly description and a working Retry', () => {
		const onRetry = jest.fn()
		render(<LoadError error={fetchErr(403)} onRetry={onRetry} />)
		expect(screen.getByText("Couldn't load this")).toBeTruthy()
		expect(screen.getByText(FORBIDDEN)).toBeTruthy()
		expect(screen.queryByText('SQL boom')).toBeNull()
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
		expect(onRetry).toHaveBeenCalledTimes(1)
	})

	it('uses a custom title', () => {
		render(<LoadError error={new Error('x')} onRetry={() => {}} title="Couldn't load files" />)
		expect(screen.getByText("Couldn't load files")).toBeTruthy()
	})
})

// vim: ts=4
