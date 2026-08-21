// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Site builder — the contract shared by the publisher, the serializer and the
 * server that serves a published container.
 *
 * React-free and DOM-free on purpose: the Notillo publisher, the shell's serving
 * path and the Rust backend all agree on what is here, and none of them may be made
 * to depend on the others. No page markup is produced here — that is the publisher's
 * own serializer (`apps/notillo/src/publish/render/`).
 *
 * A published document becomes exactly one container (a zip); its layout is fixed
 * below. Everything inside a container is relative to its mount point, so the same
 * document mounted at `/` or at `/blog` produces byte-identical entries.
 */

import { type SiteIslandShape, type SiteIslandSpec, tSiteIslandShape } from '@cloudillo/types'
import * as T from '@symbion/runtype'

import type { FileVariant } from './urls.js'

/**
 * Any stored value at all, `null` included.
 *
 * **`T.unknown` refuses `null` and `undefined`** ("expected anything but
 * undefined"), so `T.record(T.unknown)` fails the whole map over one null member
 * and `T.array(T.unknown)` fails a whole list over one null element. That is the
 * exact opposite of what every container in the site path wants: a list is decoded
 * shallowly *so that* its members can be judged one at a time downstream, and one
 * `null` in a block's props must not delete the block.
 */
export const tAnyValue: T.Type<unknown> = T.nullable(T.unknown)

// ── Container layout ──

/**
 * Extension of a content fragment. A page at `/blog/hello` under a container
 * mounted at `/` is stored as `blog/hello.part.html`, and is served both wrapped
 * (at `/blog/hello`) and verbatim (at `/blog/hello.part.html`).
 */
export const SITE_FRAGMENT_EXT = '.part.html'

/** Container-relative path of the mount root, which has no path segment of its own. */
export const SITE_ROOT_PATH = 'index'

/** Container-relative path of the not-found fragment, without the extension. */
const SITE_NOT_FOUND_PATH = '404'

/** Fragment served for a path the container does not hold. */
export const SITE_NOT_FOUND_ENTRY = `${SITE_NOT_FOUND_PATH}${SITE_FRAGMENT_EXT}`

/** Directory holding the generated per-tag listings. */
export const SITE_TAGS_DIR = 'tags'

/** Feed of an `index` page, stored beside it as `<index-path>/feed.xml`. */
const SITE_FEED_NAME = 'feed.xml'

/**
 * This document's portion of the sitemap. It stores **paths**, not URLs — the
 * server absolutises them as it serves, so an `app_domain` change cannot stale
 * every published container.
 */
export const SITE_SITEMAP_ENTRY = 'sitemap.xml'

/** Metadata-only manifest. It carries no page text; the fragments are the one copy. */
export const SITE_MANIFEST_ENTRY = '_site/manifest.json'

/**
 * Container-relative form of a page path: no leading or trailing slash, and the
 * mount root spelled `index`, since a zip entry cannot be a bare directory.
 */
export function siteEntryPath(path: string): string {
	return path.replace(/^\/+|\/+$/g, '') || SITE_ROOT_PATH
}

export function sitePageEntry(path: string): string {
	return `${siteEntryPath(path)}${SITE_FRAGMENT_EXT}`
}

/** Longest a tag slug may get, matching the page-slug cap in Notillo's `publish/slug.ts`. */
const TAG_SLUG_MAX = 64

/**
 * URL- and zip-safe form of a tag.
 *
 * **ASCII, and this is the file that owns the reason.** A tag — like a page slug
 * (`apps/notillo/src/publish/slug.ts`) and like a mount path — is simultaneously a
 * zip entry path and a URL path, and Unicode across the two means committing to one
 * normalization form at generation, at lookup, and inside whatever the blob adapter
 * sits on. An NFD/NFC mismatch in production is not recoverable. Percent-encoding
 * would work, but it puts `%C3%A9` in a zip entry name, where one accidental round
 * of decoding anywhere breaks the lookup silently.
 *
 * The marks are matched as `\p{M}` and never as a literal `U+0300`–`U+036F` range: a
 * combining character written into the source attaches itself to the bracket before
 * it, and the editing tools normalise a typed `\u` escape back into the raw one.
 *
 * Accents fold rather than vanish (`Ötlet` → `otlet`); a tag folding to nothing
 * yields `''` and the caller emits neither a listing nor a link for it.
 */
export function siteTagSlug(tag: string): string {
	return tag
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, TAG_SLUG_MAX)
		.replace(/^-+|-+$/g, '')
}

export function siteTagEntry(tag: string): string | undefined {
	const slug = siteTagSlug(tag)
	return slug ? `${SITE_TAGS_DIR}/${slug}${SITE_FRAGMENT_EXT}` : undefined
}

export function siteFeedEntry(indexPath: string): string {
	const path = siteEntryPath(indexPath)
	return path === SITE_ROOT_PATH ? SITE_FEED_NAME : `${path}/${SITE_FEED_NAME}`
}

// ── Reserved names ──

/**
 * First path segments the node serves itself, matched exactly.
 *
 * Lives here rather than in Notillo because two callers need it: the publisher's
 * slug check and the shell's mount-path field. It is advisory by design — there is
 * deliberately no enforcing copy on the server, because on the app domain `ServeDir`
 * and the shell's SPA fallback both run *before* the site
 * (`crates/cloudillo/src/routes/static_files.rs`, `static_fallback_handler`), so a
 * page or a mount claiming a reserved name is simply unreachable and can never
 * shadow a system route.
 *
 * The list states what the node owns, not what a slug can currently spell — so
 * `.well-known` and `sw.js` stay even though no slug can produce them, and `api` and
 * `ws` stay against the day the app domain gains a same-origin route of either kind.
 */
const RESERVED_SITE_ROOTS: readonly string[] = [
	'sw.js',
	'apps',
	'fonts',
	'sounds',
	'.well-known',
	'api',
	'ws',
	'login',
	's',
	'register',
	'reset-password',
	'idp',
	'onboarding'
]

/** First path segments reserved by prefix: `assets-<version>`, `~…`, `@…`. */
const RESERVED_SITE_ROOT_PREFIXES: readonly string[] = ['assets-', '~', '@']

/**
 * Reserved at the root level of **any** document, mounted anywhere: `index` is the
 * container's spelling of a mount root, `tags` is where generated tag listings go,
 * `404` is the not-found fragment, and `_site` holds the manifest. `sitemap.xml` and
 * `feed.xml` are generated too but need no entry: a slug admits no dot.
 */
export const RESERVED_CONTAINER_ROOTS: readonly string[] = [
	SITE_ROOT_PATH,
	SITE_TAGS_DIR,
	SITE_NOT_FOUND_PATH,
	'_site'
]

export type ReservedReason = 'site' | 'container'

export interface ReservedContext {
	/**
	 * The slug is a **site** root segment — the page sits at the top of a document
	 * that is itself mounted at `/`. Only the site-wide names are gated on this: a
	 * document mounted at `/blog` puts its pages one segment deeper than anything
	 * the node serves itself.
	 */
	atRoot: boolean
	/**
	 * The page sits at the top of its **document**, whatever the document is
	 * mounted at. The container's own generated entries (`index`, `tags`, `404`,
	 * `_site`) live at that level in every mount position, so they are gated on
	 * this and not on `atRoot`.
	 */
	atContainerRoot: boolean
}

/** Why this slug cannot be published, or `undefined` when it can. */
export function reservedSlugReason(slug: string, ctx: ReservedContext): ReservedReason | undefined {
	if (ctx.atContainerRoot && RESERVED_CONTAINER_ROOTS.includes(slug)) return 'container'
	if (!ctx.atRoot) return undefined
	if (RESERVED_SITE_ROOTS.includes(slug)) return 'site'
	if (RESERVED_SITE_ROOT_PREFIXES.some((prefix) => slug.startsWith(prefix))) return 'site'
	return undefined
}

// ── Mount paths ──

/**
 * Longest a mount path may get. Matches `MAX_MOUNT_PATH_LEN` in
 * `crates/cloudillo-site/src/handler.rs`, which is the enforcing copy — a mount
 * path becomes a database key, so the server checks it whatever the client does.
 */
export const MOUNT_PATH_MAX = 512

/** Why a typed mount path cannot be used. */
export type MountPathProblem = 'not-absolute' | 'dot-segment' | 'charset' | 'too-long' | 'reserved'

export interface MountPathResult {
	/** Canonical form, present exactly when the input is usable. */
	path?: string
	/** Why it is not usable, present exactly when `path` is absent. */
	problem?: MountPathProblem
	/** The segment the problem is about, so a message can name it. */
	segment?: string
}

/**
 * Canonical form of a mount path, or the reason it has none.
 *
 * Mirrors `normalize_mount_path` in `crates/cloudillo-site/src/handler.rs` — one
 * stored spelling per served path, because `SiteEntry::resolve_mount` trims
 * trailing slashes and would otherwise let `/blog` and `/blog/` past the unique
 * index and then fight over the same prefix.
 *
 * Stricter than the server, deliberately: it lowercases and accepts only `[a-z0-9-]`
 * segments, for the ASCII reason `siteTagSlug` states. Safe in one direction only —
 * everything this accepts, the server accepts too.
 */
export function normalizeMountPath(raw: string): MountPathResult {
	const trimmed = raw.trim()
	if (trimmed && !trimmed.startsWith('/')) return { problem: 'not-absolute' }

	const segments: string[] = []
	for (const raw of trimmed.split('/')) {
		if (!raw) continue
		if (raw === '.' || raw === '..') return { problem: 'dot-segment', segment: raw }
		const segment = raw.toLowerCase()
		if (!/^[a-z0-9][a-z0-9-]*$/.test(segment)) return { problem: 'charset', segment: raw }
		segments.push(segment)
	}
	if (!segments.length) return { path: '/' }

	// Only the first segment is checked: it is the one that becomes a top-level URL
	// segment and can collide with something the node serves itself. `404` is in the
	// container set, so a mount at `/404` is refused too — which is right, since the
	// root container's own not-found fragment already answers there.
	const [root] = segments
	if (
		RESERVED_CONTAINER_ROOTS.includes(root) ||
		RESERVED_SITE_ROOTS.includes(root) ||
		RESERVED_SITE_ROOT_PREFIXES.some((prefix) => root.startsWith(prefix))
	) {
		return { problem: 'reserved', segment: root }
	}

	const path = `/${segments.join('/')}`
	return path.length > MOUNT_PATH_MAX ? { problem: 'too-long' } : { path }
}

// ── Fragment metadata ──

/**
 * Type of the metadata script that opens every fragment. Non-executable. The server
 * hoists it into `<head>`; the client reads it after a content swap.
 */
export const SITE_PAGE_META_TYPE = 'application/cloudillo-page+json'

/**
 * Payload of that script. Keys are the wire format — do not rename them. A validator
 * and not an interface: the reader is a different package and reads it back out of
 * markup, where nothing upstream is type-checked.
 */
export const tSitePageMeta = T.struct({
	title: T.string,
	description: T.optional(T.string),
	/** Absolute URL. An `og:image` cannot be container-relative, so the publisher resolves it. */
	image: T.optional(T.string),
	/** `'@'`-prefixed means an idTag, anything else is free text. */
	author: T.optional(T.string),
	/** Publication date, ISO 8601. */
	date: T.optional(T.string),
	archetype: T.string
})
export type SitePageMeta = T.TypeOf<typeof tSitePageMeta>

// U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR are line terminators to a
// script parser, so they are built here rather than written into this file.
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

/**
 * `</script` inside the JSON would end the element, and the two separators above
 * would break the script it sits in. Escaped as `\u` sequences, which `JSON.parse`
 * restores unchanged.
 */
function escapeJsonForScript(json: string): string {
	return json
		.replace(/</g, '\\u003c')
		.replaceAll(LINE_SEPARATOR, '\\u2028')
		.replaceAll(PARAGRAPH_SEPARATOR, '\\u2029')
}

/** The metadata script element, which must be the first element of every fragment. */
export function renderPageMetaScript(meta: SitePageMeta): string {
	const json = escapeJsonForScript(JSON.stringify(meta))
	return `<script type="${SITE_PAGE_META_TYPE}">${json}</script>`
}

// ── `_site/manifest.json` ──

/** One published page. Metadata only — the fragment holds the text. */
export const tSiteManifestPage = T.struct({
	/** Container-relative, without the fragment extension. */
	path: T.string,
	title: T.string,
	archetype: T.string,
	tags: T.optional(T.array(T.string)),
	/** pageIds from the mount root down to the parent, nearest last. Absent at the root. */
	ancestry: T.optional(T.array(T.string))
})
export type SiteManifestPage = T.TypeOf<typeof tSiteManifestPage>

/**
 * A navigation entry. `children` is left empty by the publisher — nav is flat links
 * plus breadcrumbs, and a breadcrumb comes from the page's own `ancestry`.
 *
 * Self-recursive, so the type is hand-written and the validator carries an explicit
 * annotation: `T.TypeOf` infers `any` through a `T.lazy` cycle.
 */
export interface SiteNavEntry {
	path: string
	title: string
	children?: SiteNavEntry[]
}

export const tSiteNavEntry: T.Type<SiteNavEntry> = T.struct({
	path: T.string,
	title: T.string,
	children: T.optional(T.array(T.lazy((): T.Type<SiteNavEntry> => tSiteNavEntry)))
})

/**
 * How deep a nav entry may nest before `decodeSiteManifest` refuses it.
 *
 * Not redundant: `tSiteNavEntry` recurses through `T.lazy` with no bound of its own,
 * so a hand-written `_site/manifest.json` nesting a few thousand deep overflows the
 * stack inside `T.decode` — and `decodeSiteManifest` is a published export whose
 * signature promises `undefined` rather than a throw. Set well above what any real
 * manifest reaches.
 */
const MAX_SITE_NAV_DEPTH = 8

/** True when `entry` nests deeper than the cap, counting the entry itself as level 1. */
function navTooDeep(entry: unknown, depth = 1): boolean {
	if (depth > MAX_SITE_NAV_DEPTH) return true
	// Read structurally, before any decode: the point is to answer without ever
	// recursing into `tSiteNavEntry`, which is what would overflow.
	const children = (entry as { children?: unknown })?.children
	if (!Array.isArray(children)) return false
	return children.some((child) => navTooDeep(child, depth + 1))
}

/**
 * The writer's contract — strict, and what `buildManifest` in
 * `apps/notillo/src/publish/tree.ts` is typed by. The reader wants something more
 * forgiving; that is `decodeSiteManifest` below, not this.
 */
export const tSiteManifest = T.struct({
	version: T.literal(1),
	/** Where this container is mounted in the site, e.g. `/` or `/blog`. */
	mountPath: T.string,
	/** pageId -> page. Drafts are absent, which is what makes them absent from the site. */
	pages: T.record(tSiteManifestPage),
	/** Top-level published entries only; breadcrumbs come from `pages[].ancestry`. */
	nav: T.array(tSiteNavEntry)
})
export type SiteManifest = T.TypeOf<typeof tSiteManifest>

/**
 * The same document seen loosely, so one bad entry cannot cost the rest.
 *
 * `T.record` fails the whole record on a single refused member, and a manifest is
 * read by a page that still has to render — so the envelope is decoded here and the
 * entries one at a time below.
 */
const tSiteManifestEnvelope = T.struct({
	version: T.literal(1),
	mountPath: T.string,
	pages: T.record(tAnyValue),
	nav: T.array(tAnyValue)
})

/**
 * A fetched `_site/manifest.json`, or nothing.
 *
 * Per entry, not per document: a page the decode refuses costs itself its breadcrumb
 * and nothing else. A missing or newer `version` costs the whole manifest, because
 * a table whose shape moved cannot be read entry by entry either.
 *
 * `unknownFields: 'drop'` throughout — a newer publisher generation adding a field
 * must not delete a page from every older reader's breadcrumb trail.
 *
 * **Never throws**, which the signature above is the only statement of. The nav cap
 * is what actually keeps that true (`MAX_SITE_NAV_DEPTH`); the `try` below is the
 * guarantee for whatever the cap does not see, since every caller of this is a page
 * that still has to render.
 */
export function decodeSiteManifest(raw: unknown): SiteManifest | undefined {
	try {
		const envelope = T.decode(tSiteManifestEnvelope, raw, { unknownFields: 'drop' })
		if (!T.isOk(envelope)) return undefined

		const pages: Record<string, SiteManifestPage> = {}
		for (const [pageId, entry] of Object.entries(envelope.ok.pages)) {
			const page = T.decode(tSiteManifestPage, entry, { unknownFields: 'drop' })
			if (T.isOk(page)) pages[pageId] = page.ok
		}

		const nav: SiteNavEntry[] = []
		for (const entry of envelope.ok.nav) {
			// Before the decode, not inside it: an over-deep entry has to be refused
			// by something that never descends into it. See `MAX_SITE_NAV_DEPTH`.
			if (navTooDeep(entry)) continue
			const decoded = T.decode(tSiteNavEntry, entry, { unknownFields: 'drop' })
			if (T.isOk(decoded)) nav.push(decoded.ok)
		}

		return {
			version: 1,
			mountPath: envelope.ok.mountPath,
			pages,
			nav
		}
	} catch (err) {
		console.error('[site] Malformed manifest:', err)
		return undefined
	}
}

// ── Managed files ──

/**
 * A media block stores no URL, only this opaque scheme — `cl-file:<kind>:<fileId>`,
 * or the legacy untyped `cl-file:<fileId>`. The editor resolves it per viewport
 * (`resolveFileUrl` in `apps/notillo/src/editor/NotilloEditor.tsx`); the publisher
 * has no viewport, so it resolves it into a `srcset` ladder instead.
 *
 * `kind` is informational — the block's own type is what the serializer trusts.
 */
export interface SiteFileRef {
	kind: string
	fileId: string
}

const CL_FILE_PREFIX = 'cl-file:'

/** The reference in a media block's `props.url`, or nothing if it is not one. */
export function parseSiteFileRef(url: unknown): SiteFileRef | undefined {
	if (typeof url !== 'string' || !url.startsWith(CL_FILE_PREFIX)) return undefined
	const rest = url.slice(CL_FILE_PREFIX.length)
	const colon = rest.indexOf(':')
	if (colon === -1) return rest ? { kind: 'img', fileId: rest } : undefined
	const fileId = rest.slice(colon + 1)
	return fileId ? { kind: rest.slice(0, colon), fileId } : undefined
}

// ── Serializer input ──

/**
 * One block of a page, as the publisher hands it over: a stored block record plus
 * the RTDB key it was stored under, which is what a child's `pb` names.
 */
export interface SiteSourceBlock {
	id: string
	/** pageId. Carried unread — pass one page's blocks at a time. */
	p?: string
	t: string
	pr?: Record<string, unknown>
	/**
	 * Block content in the publisher's own storage format. Opaque here — core never
	 * reads it; the publisher's serializer narrows it.
	 */
	c?: unknown
	/** parentBlockId; null or absent at the top level. */
	pb?: string | null
	o: number
	/** updatedAt / updatedBy, carried unread so a stored record spreads in cleanly. */
	ua?: string
	ub?: string
}

/**
 * One page to serialize. Field names are the readable ones, not the stored codes:
 * `archetype` is the page record's `kind`, `publishedAt` its `pubAt`.
 */
export interface SiteSourcePage {
	pageId: string
	/** Container-relative path, without the fragment extension. `''` is the mount root. */
	path: string
	title: string
	/** An open string: an unknown archetype falls back to the `page` layout. */
	archetype: string
	tags?: string[]
	author?: string
	publishedAt?: string
	/**
	 * Meta description override. Absent, the publisher's `renderPageFragment` derives
	 * one from the page's own first ~160 characters.
	 */
	desc?: string
	/** Social image override, already resolved to an absolute URL by the publisher. */
	image?: string
}

export interface SiteSerializerOptions {
	/**
	 * pageId -> the href to link to, site-absolute (`/blog/hello`). The publisher
	 * knows the mount point; the serializer does not. An unresolved target — a
	 * draft, a deleted page, another container — renders as plain text rather than
	 * as a link into nowhere.
	 */
	resolvePageHref?: (pageId: string) => string | undefined
	/**
	 * pageId -> the target's current title. A wiki link stores `wt`, a snapshot of the
	 * title taken when the link was inserted (`apps/notillo/src/rtdb/transform.ts`), and
	 * nothing refreshes it on rename — while the editor renders the live title
	 * (`apps/notillo/src/editor/WikiLink.tsx`). Without this the published label and the
	 * one the author is looking at drift apart. Returning nothing falls back to `wt`.
	 */
	resolvePageTitle?: (pageId: string) => string | undefined
	/**
	 * tag -> the site-absolute href of its generated listing (`<mountPath>/tags/<tag>`).
	 * Same reason as above: the mount point is the publisher's knowledge, not the
	 * serializer's. An unresolved tag renders as plain text.
	 */
	resolveTagHref?: (tag: string) => string | undefined
	/**
	 * Tenant owning the files the page references. Media URLs are absolute and
	 * cross-origin — `https://cl-o.<idTag>/api/files/<id>` — because `/api/*` is not
	 * mounted on the app domain. Without it no managed media can be emitted at all.
	 */
	ownerIdTag?: string
	/**
	 * fileId -> the renditions the publisher found for it, from the descriptor
	 * `parseFileDescriptor` (`urls.ts`) reads. Absent, or returning nothing, costs an
	 * image its `srcset` ladder and its intrinsic dimensions; the `<img>` still
	 * renders, pointing at the original.
	 */
	resolveFile?: (fileId: string) => FileVariant[] | undefined
	/**
	 * Island declarations beyond the built-in ones — an app's own
	 * `contentTypes[].islands`, for block types this build knows nothing about.
	 * Built-ins always win, so this can only add. A block type with no declaration
	 * anywhere is serialized as ordinary static content.
	 */
	islands?: readonly SiteIslandSpec[]
	/**
	 * The rows an `index` block on *the page currently being rendered* resolves to.
	 * Built per page by the publisher, which is the only party that can see across
	 * pages. Absent — a serializer running outside a container build — renders an
	 * `index` block as nothing.
	 */
	resolveListing?: (query: SiteListingQuery) => readonly SiteListingEntry[] | undefined
}

// ── Archetype input ──

/**
 * A byline, resolved once at publish time and baked into the fragment — a live
 * lookup would need an island for a string.
 *
 * The default is the **site owner**, never the page's creator (`cb`): on a community
 * site that would name whichever member happened to open the page, a disclosure
 * decision made by omission. `author` overrides it — `@`-prefixed resolves against a
 * profile, anything else is free text.
 */
export interface SiteByline {
	/** Display name. Falls back to the idTag when the profile resolved no name. */
	name: string
	/** Present only for a profile author, without the `@`. Free text has none. */
	idTag?: string
	/** Absolute avatar URL, resolved by the publisher — an archetype has no host. */
	avatar?: string
	/** The avatar's fileId, so a downstream verifier reads an attribute rather than a URL. */
	avatarFileId?: string
}

/** One row of a listing — from an `index` block, or from a generated tag page. */
export interface SiteListingEntry {
	/** Site-absolute href, resolved by the publisher. */
	href: string
	title: string
	/** Displayed date, ISO 8601 — the entry's `publishedAt`. */
	date?: string
	description?: string
	byline?: SiteByline
	tags?: string[]
	/** Absolute URL of the entry's social image, for the `cards` layout. */
	image?: string
	/** 0-based nesting level under the listing's root, for the `tree` layout. */
	depth?: number
}

// Validators, with the types derived — these are closed sets read back off stored
// block props, so the decoder and the union have to be the same declaration. A
// publisher decodes with them; a toolbar enumerates `.values`. Adding a member here
// is the only edit, and every switch over one becomes a compile error.
export const tSiteListingSource = T.literal('children', 'subtree', 'siblings', 'tag', 'all')
export const tSiteListingSort = T.literal('date-desc', 'date-asc', 'title', 'order')
export const tSiteListingLayout = T.literal('list', 'compact', 'tree', 'cards')

export type SiteListingSource = T.TypeOf<typeof tSiteListingSource>
export type SiteListingSort = T.TypeOf<typeof tSiteListingSort>
export type SiteListingLayout = T.TypeOf<typeof tSiteListingLayout>

/** What one `index` block asks for. Parsed from block props; resolved by the publisher. */
export interface SiteListingQuery {
	source: SiteListingSource
	tag?: string
	/** pageId the source is relative to; absent = the page the block sits on. */
	root?: string
	/** `subtree` only. 0 or absent = unlimited. */
	depth?: number
	sort: SiteListingSort
	layout: SiteListingLayout
	/** 0 or absent = no cap. */
	limit?: number
	feed?: boolean
}

/**
 * Everything an archetype needs beyond the page and its serialized body. Assembled
 * by the publisher, so the serializer and the archetypes stay pure string functions.
 *
 * An archetype frames a page and never lists other pages — listing rows reach the
 * serializer through `SiteSerializerOptions.resolveListing` instead.
 */
export interface SiteArchetypeContext {
	byline?: SiteByline
	/**
	 * Displayed publication date, ISO 8601 — `pubAt`, not `ca`. You create a page,
	 * write for a week, then publish, and creation time would date the post to the
	 * blank page.
	 */
	date?: string
	/**
	 * Last modified, ISO 8601. No stored field of its own: the snapshot is generated
	 * at publish, so `ua` read at publish time *is* last-modified-as-published.
	 * Archetypes that would find it noise ignore it.
	 */
	updated?: string
}

/**
 * The metadata a fragment carries. The resolved byline wins over the raw `author`
 * string: `@alice.example` is an address, and `article:author` wants the name.
 */
export function buildPageMeta(page: SiteSourcePage, byline?: SiteByline): SitePageMeta {
	const author = byline?.name ?? page.author
	return {
		title: page.title,
		...(page.desc !== undefined && { description: page.desc }),
		...(page.image !== undefined && { image: page.image }),
		...(author !== undefined && { author }),
		...(page.publishedAt !== undefined && { date: page.publishedAt }),
		archetype: page.archetype
	}
}

// ── Output escaping ──

/**
 * Serialization correctness, not a security boundary.
 *
 * What decides whether a published page's markup is *safe* runs on the server:
 * `cloudillo-file`'s `site_html` walks every HTML entry of a container uploaded
 * under preset `site` against an element/attribute allowlist and fails the upload
 * on anything outside it. This side no longer drops values — it only has to emit
 * well-formed HTML, so that what the server parses is the tree the publisher meant.
 */

const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
}

/** Escapes text for both element content and double-quoted attribute values. */
export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

/**
 * Href allowlist: `http:`, `https:`, `mailto:`, and relative or same-page targets.
 * Defined in `@cloudillo/types` beside `tSiteNavTarget`, which needs it and sits
 * below `libs/core` in the build order; re-exported here, where callers import it.
 */
export { safeHref } from '@cloudillo/types'

/**
 * An island's placeholder shape, which is interpolated into a class name.
 *
 * Checked because an island spec reaches the serializer from an app-authored
 * *manifest*, i.e. data off the wire. `tSiteIslandShape` is the declaration of the
 * closed set, so there is no second list to drift from it; anything it refuses falls
 * back to `box`.
 */
export function safeIslandShape(value: unknown): SiteIslandShape {
	const shape = T.decode(tSiteIslandShape, value)
	return T.isOk(shape) ? shape.ok : 'box'
}

// vim: ts=4
