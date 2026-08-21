// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'

import { buildPublishReport } from '../publish/gate.js'
import { siteBlockType } from '../rtdb/transform.js'
import type { StoredBlockRecord, StoredPageRecord } from '../rtdb/types.js'

// The gate is the document's last checkpoint before anything becomes public, so the
// two things it refuses have to be refused for the document that is actually at risk.
//
// `atRoot` in the reserved-slug check means "this document is the one mounted at the
// *site* root", because only then does a top-level page land on `/<slug>` and shadow
// a name the node itself owns. The mount path it is told about is a URL path (`/`,
// `/blog`) — never the container's own entry name for its root, which is `index`.
// Comparing the two made the check pass for `/blog` and fail for `/`: no site-root
// reservation was ever applied to the one document that needed it.

function page(id: string, over: Partial<StoredPageRecord> = {}): [string, StoredPageRecord] {
	return [id, { ti: id, pp: '__root__', o: 0, ca: '', ua: '', cb: 'u', ...over }]
}

/** The narrow slice of `RtdbClient` that `readAllPages` / `readAllBlocks` touch. */
function fakeClient(pages: [string, StoredPageRecord][]): RtdbClient {
	const collections: Record<string, { id: string; data: () => unknown }[]> = {
		p: pages.map(([id, data]) => ({ id, data: () => data })),
		b: []
	}
	return {
		collection: (name: string) => ({
			get: async () => ({ docs: collections[name] ?? [] })
		})
	} as unknown as RtdbClient
}

describe('buildPublishReport — reserved slugs at the site root', () => {
	it('should block a top-level reserved name when the document is mounted at /', async () => {
		const client = fakeClient([page('p1', { ti: 'Login' })])
		const report = await buildPublishReport({ client, mountPath: '/' })

		expect(report.reserved).toHaveLength(1)
		expect(report.reserved[0]).toMatchObject({ pageId: 'p1', slug: 'login', reason: 'site' })
		expect(report.ok).toBe(false)
	})

	it.each(['login', 'api', 'apps', 'tags'])(
		'should block the site-root name %p at /',
		async (slug) => {
			const client = fakeClient([page('p1', { ti: 'T', slug })])
			const report = await buildPublishReport({ client, mountPath: '/' })
			expect(report.reserved.map((issue) => issue.slug)).toContain(slug)
			expect(report.ok).toBe(false)
		}
	)

	it('should assume the site root when no mount path is given', async () => {
		// The option's contract: omitted, the check over-reports rather than under-reports.
		const client = fakeClient([page('p1', { ti: 'Login' })])
		const report = await buildPublishReport({ client })
		expect(report.reserved).toHaveLength(1)
		expect(report.ok).toBe(false)
	})

	it('should not apply site-root reservations to a document mounted elsewhere', async () => {
		// `/blog/login` shadows nothing the node owns, so this must publish.
		const client = fakeClient([page('p1', { ti: 'Login' })])
		const report = await buildPublishReport({ client, mountPath: '/blog' })
		expect(report.reserved).toHaveLength(0)
		expect(report.ok).toBe(true)
	})

	it('should pass a child called “page”, which nothing reserves any more', async () => {
		// It was reserved under an `index` for a pagination feature that does not
		// exist, and the archetype that triggered it is gone. A page called "Page"
		// under any parent is now an ordinary page.
		const client = fakeClient([
			page('parent', { ti: 'Blog' }),
			page('child', { ti: 'T', slug: 'page', pp: 'parent' })
		])
		const report = await buildPublishReport({ client, mountPath: '/blog' })
		expect(report.reserved).toHaveLength(0)
		expect(report.ok).toBe(true)
	})

	it('should reserve container-root names in a document mounted anywhere', async () => {
		// The container generates its own `tags/…` listings whatever it is mounted at,
		// and the tag loop in `container.ts` runs *after* the page loop — so an
		// authored page called "Tags" at `/blog` was silently replaced by them.
		const client = fakeClient([page('p1', { ti: 'T', slug: 'tags' })])
		const report = await buildPublishReport({ client, mountPath: '/blog' })
		expect(report.reserved.map((issue) => issue.reason)).toEqual(['container'])
		expect(report.ok).toBe(false)
	})

	it('should reserve the not-found fragment name', async () => {
		// `404.part.html` is generated like `index` and `tags`, so a page claiming it
		// is the same class of loss.
		const client = fakeClient([page('p1', { ti: 'T', slug: '404' })])
		const report = await buildPublishReport({ client, mountPath: '/' })
		expect(report.reserved.map((issue) => issue.reason)).toEqual(['container'])
		expect(report.ok).toBe(false)
	})

	it('should only reserve container-root names for pages that are actually top level', async () => {
		// `tags/…` is written at the top of the container, so a nested "Tags" is free.
		const client = fakeClient([
			page('parent', { ti: 'Parent' }),
			page('child', { ti: 'T', slug: 'tags', pp: 'parent' })
		])
		const report = await buildPublishReport({ client, mountPath: '/' })
		expect(report.reserved).toHaveLength(0)
		expect(report.ok).toBe(true)
	})

	it('should only reserve site-root names for pages that are actually top level', async () => {
		const client = fakeClient([
			page('parent', { ti: 'Parent' }),
			page('child', { ti: 'Login', pp: 'parent' })
		])
		const report = await buildPublishReport({ client, mountPath: '/' })
		// `/parent/login` is not `/login`, so nothing is shadowed.
		expect(report.reserved).toHaveLength(0)
	})
})

describe('buildPublishReport — unusable stored slugs', () => {
	it('should block a stored slug that is not a usable segment', async () => {
		const client = fakeClient([page('p1', { ti: 'Hello', slug: 'a/b' })])
		const report = await buildPublishReport({ client, mountPath: '/' })

		expect(report.badSlugs).toHaveLength(1)
		expect(report.badSlugs[0]).toMatchObject({ pageId: 'p1', slug: 'a/b', problem: 'chars' })
		expect(report.ok).toBe(false)
	})

	it('should report the stored value, not the folded one the container would use', async () => {
		const client = fakeClient([page('p1', { ti: 'Hello', slug: '../../evil' })])
		const report = await buildPublishReport({ client, mountPath: '/' })

		expect(report.badSlugs[0].slug).toBe('../../evil')
		// The page still resolves to something publishable, so no content is lost.
		expect(report.pages[0].path).toBe('evil')
	})

	it.each([
		['MySlug', 'chars'],
		['a b', 'chars'],
		['-lead', 'edges'],
		['trail-', 'edges'],
		['a'.repeat(300), 'too-long']
	])('should classify the stored slug %p as %p', async (slug, problem) => {
		const client = fakeClient([page('p1', { ti: 'T', slug })])
		const report = await buildPublishReport({ client, mountPath: '/' })
		expect(report.badSlugs[0]).toMatchObject({ problem })
	})

	it('should pass a conforming stored slug', async () => {
		const client = fakeClient([page('p1', { ti: 'T', slug: 'hello-world' })])
		const report = await buildPublishReport({ client, mountPath: '/' })
		expect(report.badSlugs).toHaveLength(0)
		expect(report.ok).toBe(true)
	})

	it('should report a slug cleared to null as one this publish will freeze', async () => {
		// `updatePage` clears a field by storing `null`, so an emptied slug field is
		// `null` and not absent. Tested with `=== undefined`, the dialog never told
		// the author their address was about to be fixed.
		const client = fakeClient([
			page('p1', { ti: 'Cleared', slug: null }),
			page('p2', { ti: 'Never set' }),
			page('p3', { ti: 'Fixed', slug: 'fixed' })
		])
		const report = await buildPublishReport({ client, mountPath: '/' })

		const freezes = new Map(report.pages.map((p) => [p.pageId, p.freezesSlug]))
		expect(freezes.get('p1')).toBe(true)
		expect(freezes.get('p2')).toBe(true)
		expect(freezes.get('p3')).toBe(false)
	})

	it('should report two siblings claiming one stored slug', async () => {
		// They publish as `hello` and `hello-2` with nothing said, and because both
		// carry a fixed slug neither address is ever frozen — so a later reorder
		// swaps the two live URLs.
		const client = fakeClient([
			page('p1', { ti: 'One', slug: 'hello' }),
			page('p2', { ti: 'Two', slug: 'hello' })
		])
		const report = await buildPublishReport({ client, mountPath: '/' })

		expect(report.badSlugs).toHaveLength(1)
		expect(report.badSlugs[0]).toMatchObject({ pageId: 'p2', problem: 'duplicate' })
		expect(report.ok).toBe(false)
	})

	it('should not call one slug a duplicate of a sibling under another parent', async () => {
		const client = fakeClient([
			page('a', { ti: 'A' }),
			page('b', { ti: 'B' }),
			page('p1', { ti: 'One', slug: 'hello', pp: 'a' }),
			page('p2', { ti: 'Two', slug: 'hello', pp: 'b' })
		])
		const report = await buildPublishReport({ client, mountPath: '/' })
		expect(report.badSlugs).toHaveLength(0)
	})

	it('should name a malformed slug by what is wrong with it, not as a duplicate', async () => {
		// `A/B` is folded by `slugify` before it can collide with anything, so
		// "duplicate" would describe the wrong problem.
		const client = fakeClient([
			page('p1', { ti: 'One', slug: 'a/b' }),
			page('p2', { ti: 'Two', slug: 'a/b' })
		])
		const report = await buildPublishReport({ client, mountPath: '/' })
		expect(report.badSlugs.map((issue) => issue.problem)).toEqual(['chars', 'chars'])
	})

	it('should never fault a derived slug', async () => {
		// A page with no stored slug gets one from `slugify`, which conforms by
		// construction — so it can never be the author's problem to fix.
		const client = fakeClient([
			page('p1', { ti: 'Árvíztűrő tükörfúrógép' }),
			page('p2', { ti: '🎉' }),
			page('p3', { ti: '' })
		])
		const report = await buildPublishReport({ client, mountPath: '/' })
		expect(report.badSlugs).toHaveLength(0)
	})
})

describe('buildPublishReport — pages that are not in the sidebar tree', () => {
	it('should publish an unfiled page without calling it misfiled', async () => {
		const client = fakeClient([page('p1', { ti: 'Unfiled', pp: null })])
		const report = await buildPublishReport({ client, mountPath: '/' })

		expect(report.pages.map((p) => p.path)).toEqual(['unfiled'])
		expect(report.orphaned).toHaveLength(0)
		expect(report.empty).toBe(false)
	})

	it('should name a page whose parent no longer exists', async () => {
		const client = fakeClient([page('p1', { ti: 'Orphan', pp: 'gone' })])
		const report = await buildPublishReport({ client, mountPath: '/' })

		// Published rather than dropped, and said out loud rather than left for the
		// author to notice a page missing from their own site.
		expect(report.pages.map((p) => p.pageId)).toEqual(['p1'])
		expect(report.orphaned).toEqual([{ pageId: 'p1', title: 'Orphan', path: 'orphan' }])
	})

	it('should not name an orphan that is a draft anyway', async () => {
		const client = fakeClient([page('p1', { ti: 'Orphan', pp: 'gone', draft: true })])
		const report = await buildPublishReport({ client, mountPath: '/' })

		expect(report.orphaned).toHaveLength(0)
		expect(report.suppressed.map((p) => p.pageId)).toEqual(['p1'])
	})
})

// ── The home page ──
//
// The mount root is a real address at every mount path, not only at `/`: a document
// mounted at `/blog` serves `/blog/` from the same `index` entry. So both home
// findings apply everywhere, and only one of them blocks — refusing to publish a
// document that never claimed its mount root would strand every wiki-style document
// that existed before a home page did.

describe('buildPublishReport — the home page', () => {
	it('should block a drafted home page', async () => {
		const client = fakeClient([
			page('home', { ti: 'Welcome', draft: true }),
			page('p1', { ti: 'About' })
		])
		const report = await buildPublishReport({ client, homePageId: 'home' })

		expect(report.homeDraft).toBe(true)
		expect(report.ok).toBe(false)
		// The cascade stops at the home page: the rest of the site still publishes,
		// so the author is told about one page rather than handed an empty site.
		expect(report.pages.map((p) => p.pageId)).toEqual(['p1'])
	})

	it('should report a missing home page without blocking', async () => {
		const client = fakeClient([page('p1', { ti: 'About' })])
		const report = await buildPublishReport({ client })

		expect(report.homeMissing).toBe(true)
		expect(report.homeDraft).toBe(false)
		expect(report.ok).toBe(true)
	})

	it('should treat a home page that no longer exists as a missing one', async () => {
		const client = fakeClient([page('p1', { ti: 'About' })])
		const report = await buildPublishReport({ client, homePageId: 'gone' })

		expect(report.homeMissing).toBe(true)
		expect(report.ok).toBe(true)
	})

	it('should report neither finding once a published page is the home page', async () => {
		const client = fakeClient([page('home', { ti: 'Welcome' }), page('p1', { ti: 'About' })])
		const report = await buildPublishReport({ client, homePageId: 'home' })

		expect(report.homeMissing).toBe(false)
		expect(report.homeDraft).toBe(false)
		expect(report.ok).toBe(true)
		// It goes live at the mount root, which is the empty container path.
		expect(report.pages.find((p) => p.pageId === 'home')?.path).toBe('')
	})

	it('should still reserve container names for a top-level page under a home page', async () => {
		// The home page pushes an extra level onto every top-level page's ancestry
		// without moving it out of the container root. Reading `atContainerRoot` as
		// "no ancestors" stopped reporting these the moment a home page was set.
		const client = fakeClient([
			page('home', { ti: 'Welcome' }),
			page('p1', { ti: 'Tags' }),
			page('p2', { ti: 'Notes', pp: 'home' })
		])
		const report = await buildPublishReport({ client, homePageId: 'home', mountPath: '/blog' })

		expect(report.reserved).toEqual([
			expect.objectContaining({ pageId: 'p1', slug: 'tags', reason: 'container' })
		])
		expect(report.ok).toBe(false)
	})

	it('should not report the home page itself as claiming a reserved name', async () => {
		// Its title folds to `index`, but it claims no slug at all — the mount root
		// has no path segment for a name to collide in.
		const client = fakeClient([page('home', { ti: 'Index' })])
		const report = await buildPublishReport({ client, homePageId: 'home', mountPath: '/' })

		expect(report.reserved).toEqual([])
		expect(report.ok).toBe(true)
	})

	it('should apply the home findings at a non-root mount path too', async () => {
		const client = fakeClient([page('home', { ti: 'Welcome', draft: true })])
		const report = await buildPublishReport({
			client,
			homePageId: 'home',
			mountPath: '/blog'
		})

		expect(report.homeDraft).toBe(true)
		expect(report.ok).toBe(false)
	})
})

describe('buildPublishReport — what the report says the publish freezes', () => {
	it('should not claim the home page’s address gets fixed', async () => {
		// `BuiltContainer.published` marks the home page `slugFixed`, so nothing is
		// written for it — the report has to say the same thing.
		const client = fakeClient([page('home', { ti: 'Welcome' }), page('p1', { ti: 'About' })])
		const report = await buildPublishReport({ client, homePageId: 'home' })

		expect(report.pages.find((p) => p.pageId === 'home')?.freezesSlug).toBe(false)
		expect(report.pages.find((p) => p.pageId === 'p1')?.freezesSlug).toBe(true)
	})
})

/** As `fakeClient`, plus the `b` collection — the reference walk reads that one. */
function fakeClientWithBlocks(
	pages: [string, StoredPageRecord][],
	blocks: [string, StoredBlockRecord][]
): RtdbClient {
	const collections: Record<string, { id: string; data: () => unknown }[]> = {
		p: pages.map(([id, data]) => ({ id, data: () => data })),
		b: blocks.map(([id, data]) => ({ id, data: () => data }))
	}
	return {
		collection: (name: string) => ({
			get: async () => ({ docs: collections[name] ?? [] })
		})
	} as unknown as RtdbClient
}

function storedBlock(
	id: string,
	over: Partial<StoredBlockRecord> & { t: string }
): [string, StoredBlockRecord] {
	return [id, { p: 'p1', o: 0, ua: '', ...over }]
}

/** Everything private, which is the case the gate exists to catch. */
const allPrivate = async () => ({ visibility: 'C' as const, fileName: 'secret' })

describe('buildPublishReport — references the gate has to see', () => {
	it('should collect an embedded document', async () => {
		// There was no `documentEmbed` case here at all, which is how the block-type
		// comparison stayed a raw `block.t === 'documentEmbed'` — correct only for
		// as long as that type has no short code in `BLOCK_TYPE_TO_SHORT`.
		const client = fakeClientWithBlocks(
			[page('p1', { ti: 'About' })],
			[storedBlock('b1', { t: siteBlockType('documentEmbed'), pr: { fileId: 'f-priv' } })]
		)
		const report = await buildPublishReport({ client, fetchFileInfo: allPrivate })

		expect(report.blocked).toHaveLength(1)
		expect(report.blocked[0]).toMatchObject({ fileId: 'f-priv', kind: 'embed' })
		expect(report.blocked[0].sites[0].blockId).toBe('b1')
		expect(report.ok).toBe(false)
	})

	it('should collect a page’s social image, which belongs to no block', async () => {
		// `toSourcePage` bakes it into `og:image` and into every `cards` listing row,
		// so a non-Public one 403s in every share card and search preview — while the
		// gate reported the document clean, because nothing walked page properties.
		const client = fakeClientWithBlocks([page('p1', { ti: 'About', image: 'f-img' })], [])
		const report = await buildPublishReport({ client, fetchFileInfo: allPrivate })

		expect(report.blocked).toHaveLength(1)
		expect(report.blocked[0]).toMatchObject({ fileId: 'f-img', kind: 'pageImage' })
		// No block to delete: "remove" here means clearing a page property.
		expect(report.blocked[0].sites[0].blockId).toBeUndefined()
		expect(report.ok).toBe(false)
	})

	it('should ignore a social image hosted outside Cloudillo', async () => {
		// `pageImageUrl` passes an absolute URL through untouched, and its visibility
		// is not ours to vouch for.
		const client = fakeClientWithBlocks(
			[page('p1', { ti: 'About', image: 'https://example.org/cover.png' })],
			[]
		)
		const report = await buildPublishReport({ client, fetchFileInfo: allPrivate })

		expect(report.blocked).toHaveLength(0)
		expect(report.ok).toBe(true)
	})

	it('should not block a Public social image', async () => {
		const client = fakeClientWithBlocks([page('p1', { ti: 'About', image: 'f-img' })], [])
		const report = await buildPublishReport({
			client,
			fetchFileInfo: async () => ({ visibility: 'P' as const })
		})

		expect(report.refs).toHaveLength(1)
		expect(report.blocked).toHaveLength(0)
		expect(report.ok).toBe(true)
	})
})
