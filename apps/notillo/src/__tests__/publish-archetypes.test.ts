// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	knownArchetype,
	SITE_ARCHETYPES,
	siteArchetype,
	sitePageArchetype
} from '../publish/render/archetypes.js'

// `siteArchetype` carries a stated promise: "an unknown `kind` must never fail a
// publish". A page's `kind` is a free-form stored string, and the whole container is
// built by calling `.render()` on whatever this returns — so the promise holds only
// if the lookup can never answer with something that has no `render`. Indexing the
// table directly breaks it for every name on `Object.prototype`: the result is
// truthy, so the fallback never fires, and the publish throws instead of losing one
// page's layout. `tSiteArchetypeName` is what stands between the two.

describe('siteArchetype', () => {
	it('should fall back to the page archetype for an unknown or absent kind', () => {
		expect(siteArchetype('somethingNewer')).toBe(sitePageArchetype)
		// The retired `index` archetype: a page still stored with it publishes as a
		// plain page rather than failing the container build. That is the clean
		// break the `index` block replaced it with — no migration, no listing.
		expect(siteArchetype('index')).toBe(sitePageArchetype)
		expect(siteArchetype(undefined)).toBe(sitePageArchetype)
		// A cleared `kind` is stored as `null` (`updatePage`) and means inherited.
		expect(siteArchetype(null)).toBe(sitePageArchetype)
		expect(siteArchetype('')).toBe(sitePageArchetype)
	})

	it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf'])(
		'should fall back to the page archetype for the prototype member %p',
		(name) => {
			expect(siteArchetype(name)).toBe(sitePageArchetype)
		}
	)
})

// The property panel asks this before offering its select: an archetype it has no
// option for must be offered back as its own, not silently rewritten to `page` the
// next time the author touches any other field.
describe('knownArchetype', () => {
	it('should treat an absent or cleared kind as known', () => {
		expect(knownArchetype(undefined)).toBe(true)
		expect(knownArchetype(null)).toBe(true)
	})

	it('should know every declared archetype and nothing else', () => {
		for (const name of Object.keys(SITE_ARCHETYPES)) {
			expect(knownArchetype(name)).toBe(true)
		}
		expect(knownArchetype('somethingNewer')).toBe(false)
		expect(knownArchetype('constructor')).toBe(false)
		expect(knownArchetype('')).toBe(false)
	})
})
