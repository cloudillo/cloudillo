// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { parseRelFilter } from '../profile/rel-filter.js'

describe('parseRelFilter', () => {
	it('defaults: person → connected, community → all', () => {
		expect(parseRelFilter({}, 'person')).toBe('connected')
		expect(parseRelFilter({}, 'community')).toBe('all')
	})

	it('legacy connected=1 means connected for both variants', () => {
		expect(parseRelFilter({ connected: '1' }, 'person')).toBe('connected')
		expect(parseRelFilter({ connected: '1' }, 'community')).toBe('connected')
	})

	it('followers only exists for people', () => {
		expect(parseRelFilter({ filter: 'followers' }, 'person')).toBe('followers')
		expect(parseRelFilter({ filter: 'followers' }, 'community')).toBe('all')
	})

	it('accepts followed and all', () => {
		expect(parseRelFilter({ filter: 'followed' }, 'person')).toBe('followed')
		expect(parseRelFilter({ filter: 'followed' }, 'community')).toBe('followed')
		expect(parseRelFilter({ filter: 'all' }, 'person')).toBe('all')
		expect(parseRelFilter({ filter: 'all' }, 'community')).toBe('all')
	})

	it('garbage falls back to the default', () => {
		expect(parseRelFilter({ filter: 'nope', connected: '0' }, 'person')).toBe('connected')
		expect(parseRelFilter({ filter: 'nope', connected: '0' }, 'community')).toBe('all')
	})
})

// vim: ts=4
