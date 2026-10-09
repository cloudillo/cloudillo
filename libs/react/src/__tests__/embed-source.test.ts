// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getAppBus } from '@cloudillo/core'
import { jest } from '@jest/globals'

import { embedReportToStore, grantEmbedEditable } from '../embed-source.js'

describe('embedReportToStore', () => {
	const report = (w: number, h: number, kind: 'fixed' | 'reflow' = 'reflow') => ({
		kind,
		natural: { w, h }
	})

	it('stores a size that moved beyond the threshold', () => {
		expect(embedReportToStore({ w: 400, h: 300 }, report(400, 400))).toEqual({
			w: 400,
			h: 400,
			kind: 'reflow'
		})
	})

	it('skips a size within the threshold', () => {
		expect(embedReportToStore({ w: 400, h: 300 }, report(402, 303))).toBeNull()
	})

	it('skips a report with no area', () => {
		expect(embedReportToStore({ w: 0, h: 0 }, report(0, 300))).toBeNull()
	})

	it('stores a changed kind only when the host stores one', () => {
		expect(
			embedReportToStore({ w: 400, h: 300, kind: 'reflow' }, report(400, 300, 'fixed'))
		).not.toBeNull()
		expect(embedReportToStore({ w: 400, h: 300 }, report(400, 300, 'fixed'))).toBeNull()
	})
})

describe('grantEmbedEditable', () => {
	const bus = getAppBus()
	let grant: ReturnType<typeof jest.spyOn>

	beforeEach(() => {
		grant = jest.spyOn(bus, 'grantDocument')
	})
	afterEach(() => grant.mockRestore())

	it('stores nothing when the shell refuses', async () => {
		grant.mockResolvedValue(false as never)
		expect(await grantEmbedEditable('f2', 'f1', false)).toBe(false)
		expect(grant).toHaveBeenCalledWith('f2', 'f1', 'read')
	})

	it('keeps the share when another embed of the target is still editable', async () => {
		expect(await grantEmbedEditable('f2', 'f1', false, true)).toBe(true)
		expect(grant).not.toHaveBeenCalled()
	})

	it('still grants write with other editable embeds', async () => {
		grant.mockResolvedValue(true as never)
		expect(await grantEmbedEditable('f2', 'f1', true, true)).toBe(true)
		expect(grant).toHaveBeenCalledWith('f2', 'f1', 'write')
	})
})

// vim: ts=4
