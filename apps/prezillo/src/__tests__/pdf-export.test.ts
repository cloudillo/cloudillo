// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `prerenderEmbeds` dedupe/failure mapping.
 *
 * Stubs are hand-rolled: the `jest` global is not injected under ESM.
 */

import type { PrezilloObject } from '../crdt'
import { prerenderEmbeds } from '../export/pdf-export'

describe('prerenderEmbeds', () => {
	it('renders each document embed once and maps failures', async () => {
		let calls = 0
		const bus = {
			requestEmbed: async () => {
				calls++
				throw new Error('nope')
			}
		}
		const doc = (id: string) => ({
			id,
			type: 'document',
			fileId: `f-${id}`,
			contentType: 'cloudillo/calcillo'
		})
		const objects = [doc('a'), doc('a'), doc('b'), { id: 'c', type: 'rect' }]
		const progress: [number, number][] = []
		const res = await prerenderEmbeds(objects as unknown as PrezilloObject[], {
			bus,
			sourceFileId: 's',
			onProgress: (d, t) => progress.push([d, t])
		})
		expect([...res.keys()].sort()).toEqual(['a', 'b'])
		expect([...res.values()].every((r) => !r.ok)).toBe(true)
		expect(calls).toBe(2)
		expect(progress[0]).toEqual([0, 2])
		expect(progress.at(-1)).toEqual([2, 2])
	})
})

// vim: ts=4
