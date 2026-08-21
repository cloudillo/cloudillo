// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'
import { strFromU8, unzipSync } from 'fflate'

import { buildContainer } from '../publish/container.js'
import { buildManifest, type PageWithId, resolveTree } from '../publish/tree.js'
import type { PageRecord, StoredPageRecord } from '../rtdb/types.js'

// `resolveTree` is the one part of publishing that decides what goes into the
// container at all, so the cases that matter here are the ones where a page could
// be lost: `pp` cleared to `null` by `removeFromSidebar`, `pp` naming a page that
// was deleted, and two pages pointing at each other. None of those may drop a page
// out of both `pages` and the report — the walk's own doc comment promises it.

const ROOT = '__root__'

function page(id: string, over: Partial<PageRecord> = {}): PageWithId {
	return { id, title: id, parentPageId: ROOT, order: 0, ...over }
}

function build(...pages: PageWithId[]) {
	return resolveTree(new Map(pages.map((p) => [p.id, p])))
}

describe('resolveTree — unfiled and unreachable pages', () => {
	it('should place a page whose parent was cleared to null at the top level', async () => {
		// `removeFromSidebar` writes `pp: null`, not an absent field. Matching only
		// `undefined` here put the page in neither `pages` nor the report.
		const tree = build(page('p1', { title: 'Unfiled', parentPageId: null }))

		expect(tree.pages.map((p) => p.path)).toEqual(['unfiled'])
		expect(tree.byId.get('p1')?.ancestry).toEqual([])
		// It is where the sidebar shows top-level pages, so nothing is out of place.
		expect(tree.orphaned).toEqual([])
	})

	it('should publish and report a page whose parent no longer exists', async () => {
		const tree = build(page('p1', { title: 'Orphan', parentPageId: 'gone' }))

		expect(tree.pages.map((p) => p.path)).toEqual(['orphan'])
		expect(tree.orphaned).toEqual(['p1'])
	})

	it('should keep an orphan subtree together under its lifted head', async () => {
		const tree = build(
			page('p1', { title: 'Orphan', parentPageId: 'gone' }),
			page('p2', { title: 'Child', parentPageId: 'p1' })
		)

		expect(tree.byId.get('p1')?.path).toBe('orphan')
		expect(tree.byId.get('p2')?.path).toBe('orphan/child')
		// Only the head of the subtree is misfiled; its child has a place once it does.
		expect(tree.orphaned).toEqual(['p1'])
	})

	it('should keep an orphan subtree together when the child sorts first', async () => {
		const tree = build(
			page('sec', { title: 'Section', parentPageId: 'gone', order: 20 }),
			page('kid', { title: 'Kid', parentPageId: 'sec', order: 10 })
		)

		expect(tree.byId.get('sec')?.path).toBe('section')
		expect(tree.byId.get('kid')?.path).toBe('section/kid')
		expect(tree.orphaned).toEqual(['sec'])
	})

	it('should publish and report a cycle the root walk cannot enter', async () => {
		const tree = build(
			page('p1', { title: 'One', parentPageId: 'p2', order: 1 }),
			page('p2', { title: 'Two', parentPageId: 'p1', order: 2 })
		)

		expect(tree.pages).toHaveLength(2)
		expect(tree.orphaned).toEqual(['p1'])
		expect(tree.byId.get('p1')?.path).toBe('one')
		expect(tree.byId.get('p2')?.path).toBe('one/two')
	})

	it('should dedup a lifted orphan slug against the real top-level pages', async () => {
		const tree = build(
			page('p1', { title: 'Hello' }),
			page('p2', { title: 'Hello', parentPageId: 'gone' })
		)

		expect(tree.byId.get('p1')?.path).toBe('hello')
		expect(tree.byId.get('p2')?.path).toBe('hello-2')
	})
})

describe('resolveTree — an address that is already live', () => {
	it('should let a published page keep its slug against an earlier sibling', async () => {
		// The author publishes "Hello" at `/hello`, then writes a second "Hello" and
		// drags it above the first. First-come-in-sibling-order handed the new page
		// `hello` and moved the live one to `hello-2` — permanently, since its slug
		// is fixed and `freezePublishedPages` never rewrites it.
		const tree = build(
			page('new', { title: 'Hello', order: 1 }),
			page('live', {
				title: 'Hello',
				order: 2,
				slug: 'hello',
				publishedAt: '2026-01-01T00:00:00Z'
			})
		)

		expect(tree.byId.get('live')?.path).toBe('hello')
		expect(tree.byId.get('new')?.path).toBe('hello-2')
	})

	it('should keep the sidebar order the claim did not follow', async () => {
		// Only the *claiming* is reordered: `pages` is what nav and every listing
		// read, and it still follows `order`.
		const tree = build(
			page('new', { title: 'Hello', order: 1 }),
			page('live', {
				title: 'Hello',
				order: 2,
				slug: 'hello',
				publishedAt: '2026-01-01T00:00:00Z'
			})
		)
		expect(tree.pages.map((p) => p.pageId)).toEqual(['new', 'live'])
	})

	it('should not let a page that was never published claim first', async () => {
		// A stored slug alone is not a live address — nothing has gone out under it.
		const tree = build(
			page('first', { title: 'Hello', order: 1 }),
			page('second', { title: 'Hello', order: 2, slug: 'hello' })
		)
		expect(tree.byId.get('first')?.path).toBe('hello')
		expect(tree.byId.get('second')?.path).toBe('hello-2')
	})

	it('should let a frozen orphan claim ahead of the orphans placed with it', async () => {
		const tree = build(
			page('new', { title: 'Hello', order: 1, parentPageId: 'gone' }),
			page('live', {
				title: 'Hello',
				order: 2,
				parentPageId: 'gone',
				slug: 'hello',
				publishedAt: '2026-01-01T00:00:00Z'
			})
		)

		expect(tree.byId.get('live')?.path).toBe('hello')
		expect(tree.byId.get('new')?.path).toBe('hello-2')
		expect(tree.orphaned).toEqual(['new', 'live'])
	})

	it('should still lose a frozen orphan to a top-level page the walk placed first', async () => {
		// The orphan pass runs after the whole walk down from the root, so a page
		// that is actually in the sidebar has already taken the name by the time a
		// lifted orphan asks for it. Recorded rather than fixed: keeping the orphan's
		// address would mean deciding reachability before placing anything, and a
		// broken parent chain is the rarer failure of the two.
		const tree = build(
			page('top', { title: 'Hello', order: 1 }),
			page('orphan', {
				title: 'Hello',
				order: 2,
				parentPageId: 'gone',
				slug: 'hello',
				publishedAt: '2026-01-01T00:00:00Z'
			})
		)

		expect(tree.byId.get('top')?.path).toBe('hello')
		expect(tree.byId.get('orphan')?.path).toBe('hello-2')
	})

	it('should still suffix the second of two frozen siblings, which the gate reports', async () => {
		// Genuinely unresolvable here: two live addresses cannot both be kept, so the
		// container stays well-formed and `collectBadSlugs` is what says so.
		const tree = build(
			page('a', { title: 'A', order: 1, slug: 'hello', publishedAt: '2026-01-01T00:00:00Z' }),
			page('b', { title: 'B', order: 2, slug: 'hello', publishedAt: '2026-01-01T00:00:00Z' })
		)
		expect(tree.byId.get('a')?.path).toBe('hello')
		expect(tree.byId.get('b')?.path).toBe('hello-2')
	})
})

describe('resolveTree — drafts and archetypes', () => {
	it('should suppress a draft and everything under it', async () => {
		const tree = build(
			page('p1', { title: 'Draft', draft: true }),
			page('p2', { title: 'Child', parentPageId: 'p1' }),
			page('p3', { title: 'Live' })
		)

		expect(tree.pages.map((p) => p.pageId)).toEqual(['p3'])
		// Suppressed, but resolved: the path is kept so a link to it still points
		// where the page would be if the draft were published.
		expect(tree.byId.get('p2')).toMatchObject({
			path: 'draft/child',
			draft: false,
			suppressed: true
		})
	})

	it('should hand each level its parent’s childKind', async () => {
		const tree = build(
			page('p1', { title: 'Blog', childKind: 'post' }),
			page('p2', { title: 'Post', parentPageId: 'p1' }),
			page('p3', { title: 'Note', parentPageId: 'p2' })
		)

		// The parent's declaration, never its own archetype, and never inherited
		// past one level: the post's own children are plain pages again.
		expect(tree.byId.get('p1')?.archetype).toBe('page')
		expect(tree.byId.get('p2')?.archetype).toBe('post')
		expect(tree.byId.get('p3')?.archetype).toBe('page')
	})

	it('should let an explicit kind win over the inherited one', async () => {
		const tree = build(
			page('p1', { title: 'Blog', childKind: 'post' }),
			page('p2', { title: 'About', parentPageId: 'p1', kind: 'page' })
		)
		expect(tree.byId.get('p2')?.archetype).toBe('page')
	})

	it('should publish a page still stored with the retired index archetype as a page', async () => {
		// The clean break: no migration, so `kind: 'index'` is simply an archetype
		// this build has never heard of, and an unknown archetype is a plain page.
		const tree = build(page('p1', { title: 'Blog', kind: 'index' }))
		expect(tree.byId.get('p1')?.archetype).toBe('index')
		expect(tree.pages).toHaveLength(1)
	})

	it('should fall back to page for a kind cleared to null', async () => {
		const tree = build(page('p1', { title: 'Plain', kind: null }))
		expect(tree.byId.get('p1')?.archetype).toBe('page')
	})
})

// `buildContainer` has no suite of its own, and `published[]` is the one part of it
// that decides whether a page's address gets frozen — so it is covered here, beside
// the tree it is built from.

/** The narrow slice of `RtdbClient` that `readAllPages` / `readAllBlocks` touch. */
function fakeClient(
	pages: [string, StoredPageRecord][],
	blocks: [string, Record<string, unknown>][] = []
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

function stored(id: string, over: Partial<StoredPageRecord> = {}): [string, StoredPageRecord] {
	return [id, { ti: id, pp: ROOT, o: 0, ca: '', ua: '', cb: 'u', ...over }]
}

describe('buildContainer — what the publish freezes', () => {
	it('should treat a slug cleared to null as not yet fixed', async () => {
		// `updatePage` clears a field by storing `null`. Read as "already fixed", the
		// page would never be frozen and a later rename would move its live URL.
		const built = await buildContainer({
			client: fakeClient([
				stored('p1', { ti: 'Hello', slug: null }),
				stored('p2', { ti: 'World', slug: 'world' }),
				stored('p3', { ti: 'Fresh' })
			]),
			ownerIdTag: 'owner.tld'
		})

		expect(built.published).toEqual([
			{ pageId: 'p1', slug: 'hello', slugFixed: false, alreadyPublished: false },
			{ pageId: 'p2', slug: 'world', slugFixed: true, alreadyPublished: false },
			{ pageId: 'p3', slug: 'fresh', slugFixed: false, alreadyPublished: false }
		])
	})

	it('should report the sibling-collision suffix as the slug it froze', async () => {
		const built = await buildContainer({
			client: fakeClient([stored('p1', { ti: 'Hello' }), stored('p2', { ti: 'Hello' })]),
			ownerIdTag: 'owner.tld'
		})

		expect(built.published.map((p) => p.slug)).toEqual(['hello', 'hello-2'])
	})
})

// ── The home page ──
//
// A home page is the parent of the top-level pages and publishes at the mount root
// with no path segment of its own (`index.part.html`). Two things have to hold for
// that to be safe: setting or clearing it may not move any *other* page's URL, and
// its former children must share one slug namespace with the pages they join —
// otherwise two pages claim one container entry and one of them silently wins.

function buildWithHome(homePageId: string | undefined, ...pages: PageWithId[]) {
	return resolveTree(
		new Map(pages.map((p) => [p.id, p])),
		homePageId ? { homePageId } : undefined
	)
}

describe('resolveTree — the home page', () => {
	it('should resolve the home page at the mount root and leave the others alone', async () => {
		const pages = [
			page('home', { title: 'Welcome' }),
			page('p1', { title: 'About', order: 1 }),
			page('p2', { title: 'Blog', order: 2 })
		]
		const without = buildWithHome(undefined, ...pages)
		const withHome = buildWithHome('home', ...pages)

		expect(withHome.byId.get('home')?.path).toBe('')
		// The whole promise of the model: the other pages' addresses do not move.
		expect(without.byId.get('p1')?.path).toBe('about')
		expect(withHome.byId.get('p1')?.path).toBe('about')
		expect(withHome.byId.get('p2')?.path).toBe('blog')
		// They gain the home page as their published parent, which is what gives the
		// front page a breadcrumb and every child an ancestry to render one from.
		expect(withHome.byId.get('p1')?.ancestry).toEqual(['home'])
		expect(withHome.byId.get('home')?.ancestry).toEqual([])
	})

	it('should fold a page still stored under the home page into the top level', async () => {
		// `setHomePage` reparents, but a page written by another client mid-flight —
		// or by an older build — can still carry `pp: <homeId>`.
		const tree = buildWithHome(
			'home',
			page('home', { title: 'Welcome' }),
			page('p1', { title: 'Notes', parentPageId: 'home' })
		)

		expect(tree.byId.get('p1')?.path).toBe('notes')
		expect(tree.byId.get('p1')?.ancestry).toEqual(['home'])
		expect(tree.orphaned).toEqual([])
	})

	it('should dedup a folded child against a real top-level page', async () => {
		// The whole reason the fold happens inside `childIndexOf` rather than through a
		// second walk: one `taken` set, so these cannot both claim `about`.
		const tree = buildWithHome(
			'home',
			page('home', { title: 'Welcome' }),
			page('p1', { title: 'About', order: 1 }),
			page('p2', { title: 'About', parentPageId: 'home', order: 2 })
		)

		expect(tree.byId.get('p1')?.path).toBe('about')
		expect(tree.byId.get('p2')?.path).toBe('about-2')
	})

	it('should let a frozen top-level page keep its slug against a folded child', async () => {
		// A live address wins the claim whatever the sidebar order says, exactly as
		// it does among ordinary siblings.
		const tree = buildWithHome(
			'home',
			page('home', { title: 'Welcome' }),
			page('p1', {
				title: 'About',
				slug: 'about',
				publishedAt: '2026-01-01T00:00:00Z',
				order: 2
			}),
			page('p2', { title: 'About', parentPageId: 'home', order: 1 })
		)

		expect(tree.byId.get('p1')?.path).toBe('about')
		expect(tree.byId.get('p2')?.path).toBe('about-2')
	})

	it('should behave exactly as no home page when the id names a deleted page', async () => {
		const tree = buildWithHome('gone', page('p1', { title: 'About' }))

		expect(tree.pages.map((p) => p.path)).toEqual(['about'])
		expect(tree.byId.get('p1')?.ancestry).toEqual([])
	})

	it('should not let a drafted home page suppress the top-level pages', async () => {
		// A draft suppresses its subtree, but the home page's "subtree" is the whole
		// site — so the cascade stops at it and the gate reports `homeDraft` instead.
		const tree = buildWithHome(
			'home',
			page('home', { title: 'Welcome', draft: true }),
			page('p1', { title: 'About' })
		)

		expect(tree.byId.get('home')?.suppressed).toBe(true)
		expect(tree.pages.map((p) => p.pageId)).toEqual(['p1'])
		expect(tree.byId.get('p1')?.suppressed).toBe(false)
	})

	it('should give the top-level pages the home page’s childKind', async () => {
		const tree = buildWithHome(
			'home',
			page('home', { title: 'Blog', childKind: 'post' }),
			page('p1', { title: 'Hello' })
		)

		expect(tree.byId.get('home')?.archetype).toBe('page')
		expect(tree.byId.get('p1')?.archetype).toBe('post')
	})

	it('should place an orphan under the home page, not beside it', async () => {
		const tree = buildWithHome(
			'home',
			page('home', { title: 'Welcome' }),
			page('p1', { title: 'Orphan', parentPageId: 'gone' })
		)

		expect(tree.byId.get('p1')?.path).toBe('orphan')
		expect(tree.byId.get('p1')?.ancestry).toEqual(['home'])
		expect(tree.orphaned).toEqual(['p1'])
	})
})

describe('buildManifest — the home page', () => {
	it('should publish the home page at the empty path and lead the nav with it', async () => {
		const pages = new Map(
			[
				page('home', { title: 'Welcome' }),
				page('p1', { title: 'About', order: 1 }),
				page('p2', { title: 'Notes', parentPageId: 'home', order: 2 })
			].map((p) => [p.id, p])
		)
		const tree = resolveTree(pages, { homePageId: 'home' })
		const manifest = buildManifest(tree, pages, '/', 'home')

		// `siteHref('/', '')` is `'/'`, which is what lets `siteManifestPage` match
		// the front page and give it a breadcrumb at all.
		expect(manifest.pages.home).toMatchObject({ path: '', title: 'Welcome' })
		expect(manifest.nav.map((entry) => entry.path)).toEqual(['', 'about', 'notes'])
		expect(manifest.nav[0]).toEqual({ path: '', title: 'Welcome' })
	})

	it('should keep a noNav home page out of the nav', async () => {
		const pages = new Map(
			[
				page('home', { title: 'Welcome', noNav: true }),
				page('p1', { title: 'About', order: 1 }),
				page('p2', { title: 'Notes', parentPageId: 'home', order: 2 })
			].map((p) => [p.id, p])
		)
		const tree = resolveTree(pages, { homePageId: 'home' })
		const manifest = buildManifest(tree, pages, '/', 'home')

		expect(manifest.nav.map((entry) => entry.path)).toEqual(['about', 'notes'])
	})
})

describe('buildContainer — the home page', () => {
	it('should write index.part.html and freeze no slug for it', async () => {
		const built = await buildContainer({
			client: fakeClient([
				stored('home', { ti: 'Welcome' }),
				stored('p1', { ti: 'About', o: 1 })
			]),
			ownerIdTag: 'owner.tld',
			homePageId: 'home'
		})

		expect(built.entries).toContain('index.part.html')
		expect(built.entries).not.toContain('welcome.part.html')
		expect(built.entries).toContain('about.part.html')
		// `slugFixed` for the home page, so `freezePublishedPages` never stores the
		// empty slug its path would derive.
		expect(built.published).toContainEqual({
			pageId: 'home',
			slug: '',
			slugFixed: true,
			alreadyPublished: false
		})
	})
})

// ── The `index` block, end to end ──
//
// The block is the only part of publishing that reads *other* pages while
// serializing one, so the wiring is what matters here: the publisher resolves each
// block's query against the resolved tree, the serializer bakes the rows into the
// fragment, and a feed-enabled block also drops a `feed.xml` beside the page.

/** One entry of the built container, read back out of the zip. */
async function entryText(built: { blob: Blob }, entry: string): Promise<string> {
	const zip = unzipSync(new Uint8Array(await built.blob.arrayBuffer()))
	return zip[entry] ? strFromU8(zip[entry]) : ''
}

function indexBlock(
	id: string,
	pageId: string,
	props: Record<string, unknown> = {},
	order = 1
): [string, Record<string, unknown>] {
	return [id, { p: pageId, t: 'index', o: order, pr: props, ua: '2026-01-01T00:00:00Z' }]
}

describe('buildContainer — index blocks', () => {
	it('should bake the page’s published children into its fragment', async () => {
		const built = await buildContainer({
			client: fakeClient(
				[
					stored('parent', { ti: 'Blog' }),
					stored('child', { ti: 'Hello', pp: 'parent' }),
					stored('draft', { ti: 'Unfinished', pp: 'parent', draft: true })
				],
				[indexBlock('b1', 'parent')]
			),
			ownerIdTag: 'owner.tld'
		})

		// Structural markers only — the listing markup itself is asserted in
		// `publish-serializer.test.tsx`; what this suite owns is that the rendered
		// listing reaches the zip entry at all, with the right page in it.
		const fragment = await entryText(built, 'blog.part.html')
		expect(fragment).toContain('cl-site-listing')
		expect(fragment).toContain('href="/blog/hello"')
		// Drafts show in the editor and are absent here: the publisher selects over
		// `tree.pages`, which is already draft-free.
		expect(fragment).not.toContain('Unfinished')
	})

	it('should emit feed.xml beside the page only when the block asks for it', async () => {
		const pages: [string, StoredPageRecord][] = [
			stored('parent', { ti: 'Blog' }),
			stored('child', { ti: 'Hello', pp: 'parent' })
		]

		const without = await buildContainer({
			client: fakeClient(pages, [indexBlock('b1', 'parent')]),
			ownerIdTag: 'owner.tld'
		})
		expect(without.entries).not.toContain('blog/feed.xml')

		const withFeed = await buildContainer({
			client: fakeClient(pages, [indexBlock('b1', 'parent', { feed: true })]),
			ownerIdTag: 'owner.tld'
		})
		expect(withFeed.entries).toContain('blog/feed.xml')
		expect(await entryText(withFeed, 'blog/feed.xml')).toContain('<title>Hello</title>')
	})

	it('should let the first feed-enabled block in document order supply the feed', async () => {
		// Two would collide on one path, so the later one is ignored — and "first" has
		// to mean document order, not whatever order the block collection yielded.
		const built = await buildContainer({
			client: fakeClient(
				[
					stored('parent', { ti: 'Blog' }),
					stored('a', { ti: 'Alpha', pp: 'parent' }),
					stored('b', { ti: 'Beta', pp: 'a' })
				],
				[
					indexBlock('late', 'parent', { source: 'subtree', feed: true }, 9),
					indexBlock('early', 'parent', { feed: true }, 1)
				]
			),
			ownerIdTag: 'owner.tld'
		})

		const feed = await entryText(built, 'blog/feed.xml')
		expect(feed).toContain('<title>Alpha</title>')
		// The first block lists `children`, so the grandchild the later `subtree`
		// block would have added is not in it.
		expect(feed).not.toContain('<title>Beta</title>')
	})

	it('should render nothing for a page still stored with the retired index archetype', async () => {
		// The clean break: it loses its listing and its feed and publishes as a plain
		// page, rather than failing the build over an archetype nothing implements.
		const built = await buildContainer({
			client: fakeClient([
				stored('parent', { ti: 'Blog', kind: 'index' }),
				stored('child', { ti: 'Hello', pp: 'parent' })
			]),
			ownerIdTag: 'owner.tld'
		})

		expect(built.entries).not.toContain('blog/feed.xml')
		const fragment = await entryText(built, 'blog.part.html')
		expect(fragment).toContain('data-archetype="page"')
		expect(fragment).not.toContain('cl-site-listing')
	})
})
