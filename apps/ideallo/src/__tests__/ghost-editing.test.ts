// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Awareness is peer-controlled and never runtime-validated. GhostEditing feeds the remote drag
 * delta into the routers through GhostConnectors, so its guard is the whole defence - the sibling
 * of the one ghost-shapes.test.ts covers.
 */

import { isRenderableEditing } from '../components/GhostEditing.js'
import type { IdealloPresence } from '../hooks/index.js'

type Editing = NonNullable<IdealloPresence['editing']>

function editing(over: Partial<Editing> = {}): Editing {
	return {
		objectIds: ['a', 'b'],
		action: 'drag',
		dx: 12,
		dy: -8,
		...over
	}
}

describe('isRenderableEditing', () => {
	it('accepts an ordinary drag state', () => {
		expect(isRenderableEditing(editing())).toBe(true)
		expect(isRenderableEditing(editing({ objectIds: [] }))).toBe(true)
	})

	// The guard checks the delta only, never `action` - the caller filters on that separately
	it('accepts every action a peer can broadcast', () => {
		for (const action of ['drag', 'resize', 'rotate', 'connector'] as const) {
			expect(isRenderableEditing(editing({ action }))).toBe(true)
		}
	})

	it('rejects a non-finite delta', () => {
		expect(isRenderableEditing(editing({ dx: Number.NaN }))).toBe(false)
		expect(isRenderableEditing(editing({ dy: Number.NaN }))).toBe(false)
		expect(isRenderableEditing(editing({ dx: Number.POSITIVE_INFINITY }))).toBe(false)
		expect(isRenderableEditing(editing({ dy: Number.NEGATIVE_INFINITY }))).toBe(false)
	})

	it('rejects an objectIds that is not an array of strings', () => {
		expect(isRenderableEditing(editing({ objectIds: 'a' as unknown as string[] }))).toBe(false)
		expect(isRenderableEditing(editing({ objectIds: [1] as unknown as string[] }))).toBe(false)
		expect(isRenderableEditing(editing({ objectIds: [null] as unknown as string[] }))).toBe(
			false
		)
	})

	it('rejects a missing editing state', () => {
		expect(isRenderableEditing(undefined)).toBe(false)
	})
})

// vim: ts=4
