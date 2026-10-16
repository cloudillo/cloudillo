// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Embed records, with `renderEmbed` mocked before the dynamic import. */

import { jest } from '@jest/globals'
import type { DocLinkResult } from '@cloudillo/core'

const core = await import('@cloudillo/core')
const renderEmbed = jest.fn<typeof core.renderEmbed>()
jest.unstable_mockModule('@cloudillo/core', () => ({
	...core,
	getAppBus: () => ({}),
	renderEmbed
}))

const { embedTarget, newEmbedRecord } = await import('../embeds/record.js')

const pick = (appId: string): DocLinkResult =>
	({ appId, fileId: 'f1', contentType: `cloudillo/${appId}`, fileName: 'Doc' }) as DocLinkResult
const opts = { owner: 'a.b', sourceFileId: 'src', sizing: 'box' as const }

describe('embed record', () => {
	it('embedTarget splits a cl: ref, and rejects a malformed one', () => {
		expect(
			embedTarget({ address: core.docRef('calcillo', 'a.b:f1', 'sheet=2') })
		).toMatchObject({
			appId: 'calcillo',
			owner: 'a.b',
			fileId: 'f1',
			contentType: 'cloudillo/calcillo'
		})
		expect(embedTarget({ address: 'javascript:alert(1)' })).toBeUndefined()
		expect(embedTarget({ address: 5 as unknown as string })).toBeUndefined()
		expect(embedTarget(undefined)).toBeUndefined()
	})

	it('newEmbedRecord refuses reflow sources', async () => {
		expect(await newEmbedRecord(pick('quillo'), opts)).toBe('reflow')
		expect(await newEmbedRecord(pick('notillo'), opts)).toBe('reflow')
	})

	it('newEmbedRecord takes the render size, or 400×300 when it fails', async () => {
		renderEmbed.mockResolvedValueOnce({ natural: { w: 640, h: 480 } } as never)
		const ok = await newEmbedRecord(pick('calcillo'), opts)
		expect(ok).toMatchObject({ lastNatural: { w: 640, h: 480 }, lastTitle: 'Doc' })
		expect(ok !== 'reflow' && embedTarget(ok)?.fileId).toBe('f1')

		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		renderEmbed.mockRejectedValueOnce(new Error('offline'))
		expect(await newEmbedRecord(pick('calcillo'), opts)).toMatchObject({
			lastNatural: { w: 400, h: 300 }
		})
		warn.mockRestore()
	})
})

// vim: ts=4
