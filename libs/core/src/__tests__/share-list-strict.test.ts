// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as T from '@symbion/runtype'
import { tListShareEntriesResult } from '../api-types'

const row = {
	id: '1',
	resourceType: 'file',
	resourceId: 'f1',
	subjectType: 'user',
	subjectId: 'bob.example',
	permission: 'R',
	creatorIdTag: 'alice.example',
	createdAt: '2026-01-01T00:00:00Z'
}

describe('tListShareEntriesResult', () => {
	it('fails the whole list on a corrupt row instead of hiding a grant', () => {
		// tIsoTime is plain T.string, so a missing field is what a corrupt row looks like
		const { subjectId: _, ...corrupt } = row
		const d = T.decode(tListShareEntriesResult, [row, corrupt], { coerceDate: true })
		expect(T.isErr(d)).toBe(true)
	})

	it('still decodes an unknown permission value', () => {
		const d = T.decode(tListShareEntriesResult, [{ ...row, permission: 'Z' }], {
			coerceDate: true
		})
		expect(T.isOk(d)).toBe(true)
	})
})
