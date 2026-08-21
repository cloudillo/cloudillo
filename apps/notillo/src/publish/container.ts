// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Building the container: read the document whole, serialize every published
 * page, zip the result.
 *
 * Publishing is one-shot — the whole container is regenerated every time, never
 * patched. A published generation is therefore always internally consistent, and
 * the backend's pointer flip is the only moment anything changes for a reader.
 */

import {
	type FileVariant,
	getFileUrl,
	type PublicProfile,
	parseFileDescriptor,
	parseSiteFileRef,
	SITE_MANIFEST_ENTRY,
	SITE_NOT_FOUND_ENTRY,
	SITE_SITEMAP_ENTRY,
	SITE_TAGS_DIR,
	type SiteArchetypeContext,
	type SiteByline,
	type SiteListingEntry,
	type SiteListingQuery,
	type SiteSourcePage,
	siteFeedEntry,
	sitePageEntry,
	siteTagEntry,
	siteTagSlug
} from '@cloudillo/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import { strToU8, zipSync } from 'fflate'

import { fromStoredPage, siteBlockType } from '../rtdb/transform.js'
import { decodeStoredBlock, decodeStoredPage } from '../rtdb/types.js'
import { pageImageUrl } from '../utils/page-meta.js'
import { type ListingPage, selectListing, siteListingQuery } from './listing.js'
import type { NotilloSourceBlock } from './render/index.js'
import {
	compareBlocks,
	renderNotFoundFragment,
	renderPageFragment,
	renderTagFragment,
	siteSummary
} from './render/index.js'
import {
	buildFeed,
	buildSitemap,
	type FeedEntry,
	SITE_FEED_MAX_ENTRIES,
	type SitemapRow
} from './seo.js'
import {
	buildManifest,
	listingDate,
	type PageWithId,
	type ResolvedPage,
	type ResolvedTree,
	resolveTree,
	sortForListing,
	toListingPage
} from './tree.js'

/**
 * Timestamp stamped on every zip entry.
 *
 * Fixed rather than "now" so an unchanged document produces a byte-identical
 * container, which keeps the content-addressed blob id stable across a redundant
 * republish. 1980-01-01 UTC because a zip's DOS timestamp cannot represent
 * anything earlier, so the epoch itself would be rounded to something arbitrary.
 */
const ZIP_MTIME = Date.UTC(1980, 0, 1)

/** The only mount currently supported; multi-mount is future work. */
export const DEFAULT_MOUNT_PATH = '/'

export interface BuildContainerOptions {
	client: RtdbClient
	/** Tenant the document belongs to — resolves a social image fileId to a URL. */
	ownerIdTag: string
	mountPath?: string
	/**
	 * The page served at the mount root, from the document's settings (`d/site`).
	 *
	 * Omitted, the container has no root entry and nothing is served at the mount
	 * root — which is what every document published before this existed does.
	 */
	homePageId?: string
	/**
	 * Reads one file's variant descriptor, i.e. `GET /files/:fileId/descriptor`.
	 * Omitted, every image still publishes — without a `srcset` ladder or intrinsic
	 * dimensions.
	 */
	fetchDescriptor?: (fileId: string) => Promise<string | undefined>
	/**
	 * Resolves idTags to their public profiles, i.e. `GET /profiles/batch` — the one
	 * `/profiles/*` route a file-scoped token may call. Omitted, every byline still
	 * publishes, showing the idTag and no avatar.
	 */
	fetchProfiles?: (idTags: string[]) => Promise<PublicProfile[]>
}

/**
 * One page as this container published it — what the slug lifecycle writes back once
 * the container is committed. A page's address is derived from its title until the
 * first publish makes it public, and frozen from then on: moving a live URL must be
 * a deliberate act, not a side effect of fixing a typo in a heading.
 */
export interface PublishedPageRef {
	pageId: string
	/** The slug this publish used — the last segment of the page's path. */
	slug: string
	/** The page already carried a stored `slug`, so there is nothing to freeze. */
	slugFixed: boolean
	/** The page already carried `pubAt`, so this is not its first publish. */
	alreadyPublished: boolean
}

export interface BuiltContainer {
	blob: Blob
	/** Entry names, for logging and verification. */
	entries: string[]
	pageCount: number
	/** The published pages, in tree order — see `PublishedPageRef`. */
	published: PublishedPageRef[]
}

/** The document's blocks grouped by pageId, as `readAllBlocks` returns them. */
export type BlocksByPage = Map<string, NotilloSourceBlock[]>

/**
 * Every page of the document, unprojected: `useAllPages` reads the same collection
 * through `PAGE_FIELDS`, which omits `author`, `desc` and `image` — all of which a
 * fragment's metadata needs. Shared with the publish gate.
 */
export async function readAllPages(client: RtdbClient): Promise<Map<string, PageWithId>> {
	const snapshot = await client.collection('p').get()
	const pages = new Map<string, PageWithId>()
	for (const doc of snapshot.docs) {
		// A page that will not decode is skipped and the publish goes on without it.
		// The unit is the document because a page with no title has nothing to put
		// in a `<title>`, a nav entry or a breadcrumb.
		const stored = decodeStoredPage(doc.data(), doc.id)
		if (!stored) continue
		pages.set(doc.id, { id: doc.id, ...fromStoredPage(stored) })
	}
	return pages
}

/**
 * Every block of the document, grouped by page — one query, where `usePageBlocks`
 * reads `b` a page at a time. Handed to the serializer in stored compact form: no
 * BlockNote, no ProseMirror, nothing that needs a live editor. Only the RTDB key is
 * added, because that is what a child block's `pb` names.
 */
export async function readAllBlocks(client: RtdbClient): Promise<BlocksByPage> {
	const snapshot = await client.collection('b').get()
	const byPage = new Map<string, NotilloSourceBlock[]>()
	for (const doc of snapshot.docs) {
		const stored = decodeStoredBlock(doc.data(), doc.id)
		if (!stored) continue
		const blocks = byPage.get(stored.p)
		const block: NotilloSourceBlock = { id: doc.id, ...stored }
		if (blocks) blocks.push(block)
		else byPage.set(stored.p, [block])
	}
	return byPage
}

/** Site-absolute href of a container-relative path, given where it is mounted. */
function siteHref(mountPath: string, path: string): string {
	const base = mountPath.replace(/\/+$/, '')
	return `${base}/${path}`
}

/**
 * Every managed file the *published* pages reference through the `cl-file:` scheme.
 *
 * Drafts are excluded because their blocks are never serialized, and a
 * `documentEmbed`'s `fileId` is excluded because it names another document, which
 * has no display renditions to build a ladder from.
 */
function referencedFileIds(
	pages: ResolvedTree['pages'],
	blocksByPage: Map<string, NotilloSourceBlock[]>
): string[] {
	const fileIds = new Set<string>()
	for (const resolved of pages) {
		for (const block of blocksByPage.get(resolved.pageId) ?? []) {
			const ref = parseSiteFileRef(block.pr?.url)
			if (ref) fileIds.add(ref.fileId)
		}
	}
	return [...fileIds]
}

/**
 * The renditions of every referenced file, read once per distinct file.
 *
 * A descriptor that cannot be read — the file was deleted, or this document's
 * `file:<fileId>`-scoped token cannot see it — costs that one image its ladder and
 * nothing else. Publishing a page must not fail on an image's metadata.
 */
async function readFileVariants(
	fileIds: string[],
	fetchDescriptor: (fileId: string) => Promise<string | undefined>
): Promise<Map<string, FileVariant[]>> {
	const entries = await Promise.all(
		fileIds.map(async (fileId): Promise<[string, FileVariant[]]> => {
			try {
				return [fileId, parseFileDescriptor(await fetchDescriptor(fileId))]
			} catch {
				return [fileId, []]
			}
		})
	)
	return new Map(entries)
}

/**
 * `desc` is the page's own override, or — when it has none — the summary the caller
 * already derived. Passing it in is what keeps `renderPageFragment` from deriving a
 * second copy: it falls back to `siteSummary` for a page whose `desc` is `undefined`,
 * and that is the same walk `describe` has already done and cached.
 */
function toSourcePage(
	resolved: ResolvedTree['pages'][number],
	ownerIdTag: string,
	desc: string | undefined
): SiteSourcePage {
	const { page } = resolved
	const image = pageImageUrl(page.image, ownerIdTag)
	return {
		pageId: resolved.pageId,
		path: resolved.path,
		title: page.title,
		archetype: resolved.archetype,
		...(page.tags?.length && { tags: page.tags }),
		// `!= null` throughout: a cleared site field is stored as `null`, and it
		// means exactly what an absent one means.
		...(page.author != null && { author: page.author }),
		...(page.publishedAt !== undefined && { publishedAt: page.publishedAt }),
		...(desc !== undefined && { desc }),
		...(image !== undefined && { image })
	}
}

// ── Bylines ──

/** The idTag behind an `author` override, or nothing when it is free text. */
function authorIdTag(author: string | null | undefined): string | undefined {
	return author?.startsWith('@') ? author.slice(1) : undefined
}

/**
 * Every profile a byline could need: the site owner, plus every `@`-prefixed `author`
 * override. The owner is always in the set because the byline **defaults to the site
 * owner** and never to the page's creator — see `SiteByline`.
 */
function bylineIdTags(pages: readonly ResolvedPage[], ownerIdTag: string): string[] {
	const idTags = new Set<string>([ownerIdTag])
	for (const resolved of pages) {
		const idTag = authorIdTag(resolved.page.author)
		if (idTag) idTags.add(idTag)
	}
	return [...idTags]
}

/**
 * The profiles behind those idTags. A miss is an absent key and a byline with no
 * profile falls back to the idTag, which is still true; publishing must not fail on
 * a profile lookup.
 */
async function readProfiles(
	idTags: string[],
	fetchProfiles: (idTags: string[]) => Promise<PublicProfile[]>
): Promise<Map<string, PublicProfile>> {
	try {
		const profiles = await fetchProfiles(idTags)
		return new Map(profiles.map((profile) => [profile.idTag, profile]))
	} catch {
		return new Map()
	}
}

/**
 * The byline baked into one page's fragment. Free text passes straight through,
 * covering pen names and authors not on Cloudillo.
 *
 * The avatar is served by the **site owner's** node and not the author's, the way
 * `libs/react/src/presence.tsx` resolves a peer's picture: that is the node the
 * reader is already connected to, and the only one sure to hold a mirror.
 */
function resolveByline(
	author: string | null | undefined,
	ownerIdTag: string,
	profiles: Map<string, PublicProfile>
): SiteByline {
	if (author && !author.startsWith('@')) return { name: author }

	const idTag = authorIdTag(author) ?? ownerIdTag
	const profile = profiles.get(idTag)
	const profilePic = profile?.profilePic
	return {
		name: profile?.name || idTag,
		idTag,
		...(profilePic !== undefined && {
			avatar: getFileUrl(ownerIdTag, profilePic, 'vis.pf'),
			avatarFileId: profilePic
		})
	}
}

// ── Listings ──

/**
 * Last modified, as published.
 *
 * No stored field of its own and none needed: the container is generated at
 * publish, so the newest `ua` across the page record and its blocks, read at that
 * moment, *is* last-modified-as-published.
 */
export function lastModified(
	resolved: ResolvedPage,
	blocks: NotilloSourceBlock[]
): string | undefined {
	let newest = resolved.page.updatedAt ?? ''
	for (const block of blocks) {
		if (block.ua && block.ua > newest) newest = block.ua
	}
	return newest || undefined
}

/** One page as a row of a listing, in an `index` block or on a generated tag page. */
function toListingEntry(
	resolved: ResolvedPage,
	mountPath: string,
	ownerIdTag: string,
	profiles: Map<string, PublicProfile>,
	description: string | undefined
): SiteListingEntry {
	const { page } = resolved
	const date = listingDate(resolved)
	// Absolute, like `og:image` and for the same reason: a card image is served from
	// the owner's file API, and the site host serves no files.
	const image = pageImageUrl(page.image, ownerIdTag)
	return {
		href: siteHref(mountPath, resolved.path),
		title: page.title,
		...(date && { date }),
		...(description !== undefined && { description }),
		byline: resolveByline(page.author, ownerIdTag, profiles),
		...(page.tags?.length && { tags: page.tags }),
		...(image !== undefined && { image })
	}
}

// ── Tag pages ──

/** One generated tag listing: the pages carrying that tag, and how to spell it. */
interface TagListing {
	tag: string
	pages: ResolvedPage[]
	/**
	 * The same pageIds as a set, for the duplicate check. One page carrying two tags
	 * that fold to the same slug (`Foo` and `foo`) would otherwise be listed twice,
	 * and scanning `pages` for it is linear per (page, tag) pair — a blog where every
	 * post carries `blog` pays that on all of them for a case that almost never fires.
	 */
	seen: Set<string>
}

/**
 * Every tag in use across the published pages, keyed by its URL slug. A tag that
 * folds away to nothing gets no listing, and `resolveTagHref` answers nothing for it,
 * so its occurrences render as plain text rather than links into a 404.
 */
function collectTagListings(pages: readonly ResolvedPage[]): Map<string, TagListing> {
	const listings = new Map<string, TagListing>()
	for (const resolved of pages) {
		for (const tag of resolved.page.tags ?? []) {
			const slug = siteTagSlug(tag)
			if (!slug) continue
			const listing = listings.get(slug)
			if (!listing) {
				listings.set(slug, {
					tag,
					pages: [resolved],
					seen: new Set([resolved.pageId])
				})
			} else if (!listing.seen.has(resolved.pageId)) {
				listing.seen.add(resolved.pageId)
				listing.pages.push(resolved)
			}
		}
	}
	return listings
}

/**
 * Read the document and produce the container.
 *
 * Pending debounced writes must already be flushed — see `publishSite`. This
 * function reads RTDB, so anything still sitting in a timer publishes as the
 * previous revision.
 */
export async function buildContainer(opts: BuildContainerOptions): Promise<BuiltContainer> {
	const mountPath = opts.mountPath ?? DEFAULT_MOUNT_PATH
	const [allPages, blocksByPage] = await Promise.all([
		readAllPages(opts.client),
		readAllBlocks(opts.client)
	])

	const tree = resolveTree(allPages, {
		...(opts.homePageId !== undefined && { homePageId: opts.homePageId })
	})

	// A wiki link to a draft, to a page under a draft, or to one that has since been
	// deleted has no published target. Returning undefined renders it as plain text
	// rather than as a link into a 404 — see `SiteSerializerOptions`.
	const resolvePageHref = (pageId: string): string | undefined => {
		const target = tree.byId.get(pageId)
		return target && !target.suppressed ? siteHref(mountPath, target.path) : undefined
	}

	// The editor renders the target's live title (`editor/WikiLink.tsx`); the stored `wt`
	// is a snapshot from insertion time that nothing refreshes on rename. Resolving it
	// here is what keeps the published label and the authored one the same word.
	// Suppressed pages resolve too: the link renders as plain text, and it should still
	// read as the page it names.
	const resolvePageTitle = (pageId: string): string | undefined =>
		tree.byId.get(pageId)?.page.title

	const tagListings = collectTagListings(tree.pages)

	// Only tags that actually got a listing resolve: an unslugged tag, or one carried
	// solely by a suppressed page, has no fragment to point at.
	const resolveTagHref = (tag: string): string | undefined => {
		const slug = siteTagSlug(tag)
		return slug && tagListings.has(slug)
			? siteHref(mountPath, `${SITE_TAGS_DIR}/${slug}`)
			: undefined
	}

	const [fileVariants, profiles] = await Promise.all([
		opts.fetchDescriptor
			? readFileVariants(referencedFileIds(tree.pages, blocksByPage), opts.fetchDescriptor)
			: new Map<string, FileVariant[]>(),
		opts.fetchProfiles
			? readProfiles(bylineIdTags(tree.pages, opts.ownerIdTag), opts.fetchProfiles)
			: new Map<string, PublicProfile>()
	])
	const resolveFile = (fileId: string): FileVariant[] | undefined => fileVariants.get(fileId)

	const serializerOpts = {
		resolvePageHref,
		resolvePageTitle,
		resolveTagHref,
		resolveFile,
		ownerIdTag: opts.ownerIdTag
	}

	// A page with no `desc` override falls back to its own opening prose, so a listing
	// row, a feed summary and the fragment's metadata all say the same thing.
	//
	// One summary per page however many listings show it: `siteSummary` walks and
	// serializes the blocks, and an `index` block on every page makes that
	// O(pages × rows). The `has`/`get` pair is not decoration — `siteSummary`
	// legitimately answers `undefined`, and `get() ?? compute` would never cache a
	// miss.
	const summaryCache = new Map<string, string | undefined>()
	const describe = (resolved: ResolvedPage): string | undefined => {
		// `!= null`: `desc` is cleared by writing a null, and a cleared override means
		// "fall back to the prose", not "no summary".
		if (resolved.page.desc != null) return resolved.page.desc
		if (summaryCache.has(resolved.pageId)) return summaryCache.get(resolved.pageId)
		const summary = siteSummary(
			blocksByPage.get(resolved.pageId) ?? [],
			undefined,
			serializerOpts
		)
		summaryCache.set(resolved.pageId, summary)
		return summary
	}

	const entryCache = new Map<string, SiteListingEntry>()
	const entryFor = (resolved: ResolvedPage): SiteListingEntry => {
		const hit = entryCache.get(resolved.pageId)
		if (hit) return hit
		const entry = toListingEntry(
			resolved,
			mountPath,
			opts.ownerIdTag,
			profiles,
			describe(resolved)
		)
		entryCache.set(resolved.pageId, entry)
		return entry
	}

	// The same row as a feed entry. It carries the pageId, which a listing row has no
	// use for and a feed needs: the entry's Atom id is built from it, so it survives
	// both a rename and a move to another domain.
	const feedEntryFor = (resolved: ResolvedPage): FeedEntry => {
		const date = listingDate(resolved)
		const updated = updatedByPage.get(resolved.pageId)
		const author = resolveByline(resolved.page.author, opts.ownerIdTag, profiles).name
		const summary = describe(resolved)
		return {
			pageId: resolved.pageId,
			path: resolved.path,
			title: resolved.page.title,
			...(date && { published: date }),
			...(updated !== undefined && { updated }),
			...(author && { author }),
			...(summary !== undefined && { summary }),
			...(resolved.page.tags?.length && { tags: resolved.page.tags })
		}
	}

	// Every published page as one flat selector input, built once: an `index` block
	// on any page resolves against the same set, and rebuilding it per block would
	// be quadratic in the page count for no gain.
	const listingPages: ListingPage[] = tree.pages.map((resolved) => toListingPage(resolved))

	/** One selected row as a listing entry, carrying the depth `tree` needs. */
	const entryWithDepth = (row: ListingPage): SiteListingEntry | undefined => {
		const resolved = tree.byId.get(row.pageId)
		if (!resolved) return undefined
		return { ...entryFor(resolved), ...(row.depth !== undefined && { depth: row.depth }) }
	}

	const files: Record<string, [Uint8Array, { mtime: number }]> = {}
	const stamp = { mtime: ZIP_MTIME }

	// Only published pages are walked below, so nothing drafted reaches the sitemap
	// or a feed — the same reason drafts are absent from the listings.
	const sitemapRows: SitemapRow[] = []

	// One `lastModified` per page, before the loop: the blocks are already in memory,
	// and `feedEntryFor` below reads pages the loop has not reached yet.
	const updatedByPage = new Map<string, string>()
	for (const resolved of tree.pages) {
		const updated = lastModified(resolved, blocksByPage.get(resolved.pageId) ?? [])
		if (updated) updatedByPage.set(resolved.pageId, updated)
	}

	for (const resolved of tree.pages) {
		const blocks = blocksByPage.get(resolved.pageId) ?? []
		const date = listingDate(resolved)
		const updated = updatedByPage.get(resolved.pageId)

		const lastmod = updated ?? date
		sitemapRows.push({ path: resolved.path, ...(lastmod && { lastmod }) })

		// Document order, once. `readAllBlocks` hands them back in whatever order the
		// collection yielded, and the feed below is "the first `index` block on the
		// page", not "the first the map happened to visit". The serializer's own
		// comparator, so it is the same order the fragment renders in.
		const ordered = [...blocks].sort(compareBlocks)

		// The serializer cannot see across pages, so the publisher answers each
		// `index` block's query for it — bound to *this* page, which is what an
		// unset `root` on the block means.
		const resolveListing = (query: SiteListingQuery): SiteListingEntry[] =>
			selectListing(listingPages, query, resolved.pageId)
				.map(entryWithDepth)
				.filter((entry): entry is SiteListingEntry => entry !== undefined)

		const ctx: SiteArchetypeContext = {
			byline: resolveByline(resolved.page.author, opts.ownerIdTag, profiles),
			...(date && { date }),
			...(updated !== undefined && { updated })
		}
		const fragment = renderPageFragment(
			toSourcePage(resolved, opts.ownerIdTag, describe(resolved)),
			blocks,
			{ ...serializerOpts, resolveListing },
			ctx
		)
		files[sitePageEntry(resolved.path)] = [strToU8(fragment), stamp]

		// The feed is one `index` block's listing in another serialization, so it
		// costs the publisher almost nothing. Stored verbatim beside the page,
		// without the fragment extension: it is served as XML, never wrapped.
		//
		// The **first** feed-enabled block wins. A second one on the same page would
		// collide on the same path, and picking one silently beats writing whichever
		// the loop reached last.
		const feedBlock = ordered.find(
			(block) => siteBlockType(block.t) === 'index' && siteListingQuery(block.pr).feed
		)
		if (feedBlock) {
			// Sliced before the entries are built, not after: the rows are already in
			// feed order — `selectListing` applied the sort — and `buildFeed` would
			// otherwise discard whatever a 500-post blog derived beyond the first 20.
			const entries = selectListing(
				listingPages,
				siteListingQuery(feedBlock.pr),
				resolved.pageId
			)
				.slice(0, SITE_FEED_MAX_ENTRIES)
				.map((row) => tree.byId.get(row.pageId))
				.filter((target): target is ResolvedPage => target !== undefined)
				.map(feedEntryFor)
			const feed = buildFeed({
				pageId: resolved.pageId,
				path: resolved.path,
				title: resolved.page.title,
				entries
			})
			files[siteFeedEntry(resolved.path)] = [strToU8(feed), stamp]
		}
	}

	// Tag pages are purely generated: a listing filtered by tag, with no authored
	// content anywhere in it. They are ordinary fragments at ordinary paths, so the
	// serving path needs nothing new for them.
	for (const listing of tagListings.values()) {
		const entry = siteTagEntry(listing.tag)
		if (!entry) continue
		const pages = sortForListing(listing.pages)
		const fragment = renderTagFragment(listing.tag, pages.map(entryFor), { resolveTagHref })
		files[entry] = [strToU8(fragment), stamp]

		// A tag listing is a real URL that nothing links except an inline tag, so the
		// sitemap is how a crawler finds one. It is as fresh as its freshest member.
		let lastmod = ''
		for (const page of pages) {
			const date = updatedByPage.get(page.pageId) ?? listingDate(page)
			if (date > lastmod) lastmod = date
		}
		sitemapRows.push({
			path: `${SITE_TAGS_DIR}/${siteTagSlug(listing.tag)}`,
			...(lastmod && { lastmod })
		})
	}

	// Paths, not URLs: the server absolutises them as it serves, so an `app_domain`
	// change cannot stale the sitemap inside every published container.
	files[SITE_SITEMAP_ENTRY] = [strToU8(buildSitemap(sitemapRows)), stamp]

	// An ordinary fragment, so the server wraps it exactly like a page and only the
	// status differs.
	files[SITE_NOT_FOUND_ENTRY] = [strToU8(renderNotFoundFragment()), stamp]

	const manifest = buildManifest(tree, allPages, mountPath, opts.homePageId)
	files[SITE_MANIFEST_ENTRY] = [strToU8(JSON.stringify(manifest)), stamp]

	const zipped = zipSync(files)
	return {
		blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
		entries: Object.keys(files),
		pageCount: tree.pages.length,
		published: tree.pages.map((resolved) => ({
			pageId: resolved.pageId,
			// The path is built from this slug, so the last segment is it —
			// including the `-2` a sibling collision added, which is the address
			// the reader will see and therefore the one that gets frozen.
			slug: resolved.path.slice(resolved.path.lastIndexOf('/') + 1),
			// `!= null`, not `!== undefined`: a cleared slug stores `null`
			// (`updatePage`), and reading that as "fixed" would leave the page
			// unfrozen forever, so a later rename would move a live URL.
			//
			// The home page has no slug to freeze — without the guard this would store
			// `slug: ''`. Left underived on purpose: cleared as home later, it derives
			// a fresh slug from its title and freezes that.
			slugFixed: resolved.path === '' || resolved.page.slug != null,
			alreadyPublished: resolved.page.publishedAt !== undefined
		}))
	}
}

// vim: ts=4
