// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The publish gate: everything the author has to be shown before a container is
 * generated, and the two findings that stop one being generated at all — a
 * reference to a non-Public file, and a slug the node itself owns.
 *
 * Insert-time refusal (`requirePublic`) cannot be sufficient: visibility can be
 * lowered after the fact, content arrives by import and by paste, and a document
 * that has never been published was never gated. So the whole resolved tree is
 * walked again here, at the last moment before anything becomes public.
 *
 * No bus and no API client, the rule `buildContainer` follows: the one thing this
 * cannot compute — a file's visibility — is injected.
 */

import type { ActionVisibility, ReservedReason } from '@cloudillo/core'
import { parseSiteFileRef, reservedSlugReason } from '@cloudillo/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import * as T from '@symbion/runtype'

import { siteBlockType } from '../rtdb/transform.js'
import {
	type BlocksByPage,
	DEFAULT_MOUNT_PATH,
	lastModified,
	readAllBlocks,
	readAllPages
} from './container.js'
import { baseSlug, MAX_SLUG_LENGTH, type SlugProblem, slugProblem } from './slug.js'
import { type ResolvedPage, type ResolvedTree, resolveTree } from './tree.js'

/**
 * What a reference points at: a media block's file, an embedded document, or the
 * page's own social image, which belongs to no block at all.
 */
export type PublishRefKind = 'media' | 'embed' | 'pageImage'

/** One block that carries a reference — where the author has to go to fix it. */
export interface PublishRefSite {
	pageId: string
	title: string
	/** Container-relative path of the page the block sits on. */
	path: string
	/** Absent for a `pageImage`: it is a page property, not a block. */
	blockId?: string
}

/** One referenced file, with every published block that points at it. */
export interface PublishRef {
	fileId: string
	kind: PublishRefKind
	/**
	 * The file's visibility, or `undefined` when it could not be read — a deleted
	 * file, or one this document's `file:<fileId>`-scoped token cannot see. Both
	 * are treated as not public: a reference the publisher cannot vouch for is
	 * exactly the reference a reader will find broken.
	 */
	visibility?: ActionVisibility
	fileName?: string
	sites: PublishRefSite[]
}

/** A published page whose slug is a name the node owns. */
export interface PublishReservedIssue {
	pageId: string
	title: string
	path: string
	slug: string
	reason: ReservedReason
}

/** A published page whose **stored** slug is not a usable URL segment. */
export interface PublishSlugIssue {
	pageId: string
	title: string
	path: string
	/** The stored value, as typed — not the sanitized one the container would use. */
	slug: string
	/**
	 * `SlugProblem` is what the property panel's single-field check answers with;
	 * the two extra cases are whole-document ones it cannot see — a slug too long
	 * for a URL segment, and one a sibling already claims.
	 */
	problem: SlugProblem | 'too-long' | 'duplicate'
}

/** What this publish does to a page that was already live, or was not. */
export type PublishPageStatus = 'new' | 'updated' | 'unchanged'

/** One page as this publish will publish it. */
export interface PublishPageEntry {
	pageId: string
	title: string
	path: string
	archetype: string
	status: PublishPageStatus
	/**
	 * This publish writes the derived slug into the record and freezes the page's
	 * address there, so the author is told before it happens rather than
	 * discovering it the next time they rename a heading.
	 */
	freezesSlug: boolean
}

/** A page kept out of the container because it is a draft, or sits under one. */
export interface PublishSuppressedPage {
	pageId: string
	title: string
	path: string
	/** The author drafted this page. `false` means an ancestor's draft removed it. */
	own: boolean
	/** Title of the drafted ancestor, when it was not this page's own doing. */
	draftedAncestor?: string
}

/**
 * A page whose parent chain is broken — a `parentPageId` naming a page that no
 * longer exists, or a cycle — and which `resolveTree` therefore publishes at the
 * top level rather than dropping.
 */
export interface PublishOrphanedPage {
	pageId: string
	title: string
	/** Where it goes live: a top-level path, whatever the record's parent says. */
	path: string
}

export interface PublishReport {
	/** Published pages, in tree order — what goes live. */
	pages: PublishPageEntry[]
	/** Pages the container leaves out, own drafts and collateral alike. */
	suppressed: PublishSuppressedPage[]
	/** Pages published at the top level because their parent chain is broken. */
	orphaned: PublishOrphanedPage[]
	/** Every file the published pages reference, public ones included. */
	refs: PublishRef[]
	/** The subset of `refs` an anonymous reader could not fetch. Blocks the publish. */
	blocked: PublishRef[]
	/** Published pages claiming a reserved slug. Blocks the publish. */
	reserved: PublishReservedIssue[]
	/** Published pages whose stored slug is not a usable segment. Blocks the publish. */
	badSlugs: PublishSlugIssue[]
	/**
	 * Site mode is on but no page is the home page — nothing is served at the mount
	 * root. Advisory: refusing the publish would strand a wiki-style document that
	 * never meant to own its mount root.
	 */
	homeMissing: boolean
	/**
	 * The home page is a draft. Blocks: the mount root would serve nothing, and the
	 * author drafted the one page that has nowhere else to be reached from.
	 *
	 * Blocking here rather than in `resolveTree`, which does not let a drafted home
	 * page suppress the top-level pages: a finding the author can act on beats a site
	 * that silently emptied.
	 */
	homeDraft: boolean
	/** Nothing would go live — every page is a draft, or the document is empty. */
	empty: boolean
	/** Neither gate found anything, so the container may be generated. */
	ok: boolean
}

export interface PublishFileInfo {
	/**
	 * `ActionVisibility`, not `string`. This is the blocking half of the gate — a
	 * reference that is not `'P'` refuses the publish — and `api.files.getMetadata`
	 * already returns the field decoded against `tActionVisibility`. Typing it
	 * `string` here widened an already-checked value back out again, so a typo in
	 * the comparison would have compiled and quietly published private media.
	 */
	visibility?: ActionVisibility
	fileName?: string
}

export interface PublishGateOptions {
	client: RtdbClient
	/**
	 * Reads one file's metadata, i.e. `GET /files/:fileId`. Omitted, the gate still
	 * reports every reference but can block none of them.
	 */
	fetchFileInfo?: (fileId: string) => Promise<PublishFileInfo | undefined>
	/**
	 * Where this document is mounted on the site.
	 *
	 * Only the reserved-slug check reads it, and only to decide whether the document
	 * owns the site root: a document at `/blog` cannot shadow `/login`, so it keeps
	 * only the container half of the list. Omitted, the check assumes the root, which
	 * over-reports rather than under-reports.
	 */
	mountPath?: string
	/**
	 * The page served at the mount root, from the document's settings (`d/site`).
	 *
	 * Omitted — or naming a page that no longer exists — is reported as `homeMissing`,
	 * which does not block. Both home findings apply at **any** mount path: `/blog`
	 * has a mount root too, resolving to the same `index` entry.
	 */
	homePageId?: string
}

/**
 * The one prop of a `documentEmbed` this gate reads. Decoded rather than sniffed
 * because a stored `pr` is whatever the document holds and this is a *security*
 * walk: a `fileId` the check fails to recognise is a reference that goes to a
 * public page unvouched for.
 */
const tEmbedProps = T.struct({ fileId: T.optional(T.string) })
const DECODE_OPTS = { unknownFields: 'drop' } as const

/**
 * Every file the published pages reference, keyed `<kind>:<fileId>`.
 *
 * Media is found by the `cl-file:` prefix and never by parsing the URL — the stored
 * value is an opaque scheme, and a parser would start missing references the day it
 * gains a variant. A `documentEmbed` must itself be Public: an embed hands the reader
 * the live document over RTDB, where its own ABAC check decides.
 */
function collectRefs(tree: ResolvedTree, blocksByPage: BlocksByPage): Map<string, PublishRef> {
	const refs = new Map<string, PublishRef>()

	function add(kind: PublishRefKind, fileId: string, resolved: ResolvedPage, blockId?: string) {
		const key = `${kind}:${fileId}`
		const site: PublishRefSite = {
			pageId: resolved.pageId,
			title: resolved.page.title,
			path: resolved.path,
			...(blockId !== undefined && { blockId })
		}
		const ref = refs.get(key)
		if (ref) ref.sites.push(site)
		else refs.set(key, { fileId, kind, sites: [site] })
	}

	for (const resolved of tree.pages) {
		// The page's social image, which `toSourcePage` bakes into `og:image` and
		// into every `cards` listing row. It belongs to no block, so nothing in the
		// block walk below would ever see it — and a non-Public one 403s in every
		// share card and search preview, invisibly to an author who can read it.
		// A bare fileId, not a `cl-file:` URL (`utils/page-meta.ts`), so it does not
		// go through `parseSiteFileRef`. An already-absolute one is an image outside
		// Cloudillo, which `pageImageUrl` passes through and this cannot vouch for.
		const image = resolved.page.image
		if (image && !/^https?:\/\//.test(image)) add('pageImage', image, resolved)

		for (const block of blocksByPage.get(resolved.pageId) ?? []) {
			const media = parseSiteFileRef(block.pr?.url)
			if (media) add('media', media.fileId, resolved, block.id)

			// Through `siteBlockType`, like every other block-type test in the
			// publisher: a stored type may be the short code, and comparing the raw
			// value works only for as long as `documentEmbed` has none. The day it
			// gains one, a literal comparison stops matching and every embedded
			// private document walks past this gate to an anonymous reader.
			if (siteBlockType(block.t) === 'documentEmbed') {
				const props = T.decode(tEmbedProps, block.pr, DECODE_OPTS)
				const fileId = T.isOk(props) ? props.ok.fileId : undefined
				if (fileId) add('embed', fileId, resolved, block.id)
			}
		}
	}
	return refs
}

/**
 * Fill in each reference's visibility.
 *
 * One read per distinct file, all at once. A read that throws leaves `visibility`
 * absent, which counts as not public — see `PublishRef.visibility`.
 */
async function readVisibilities(
	refs: PublishRef[],
	fetchFileInfo: (fileId: string) => Promise<PublishFileInfo | undefined>
): Promise<void> {
	const distinct = [...new Set(refs.map((ref) => ref.fileId))]
	const infos = new Map<string, PublishFileInfo | undefined>(
		await Promise.all(
			distinct.map(async (fileId): Promise<[string, PublishFileInfo | undefined]> => {
				try {
					return [fileId, await fetchFileInfo(fileId)]
				} catch {
					return [fileId, undefined]
				}
			})
		)
	)

	for (const ref of refs) {
		const info = infos.get(ref.fileId)
		ref.visibility = info?.visibility
		ref.fileName = info?.fileName
	}
}

/**
 * Published pages whose **stored** slug is not a usable URL segment.
 *
 * Checked against `page.slug`, not the resolved path: `uniqueSlug` has already folded
 * the bad value into something emittable by the time the tree exists. Only a stored
 * slug can be wrong — a derived one conforms by construction.
 *
 * Two siblings storing the *same* slug is the third problem, and the one with no
 * other symptom: `uniqueSlug` publishes them as `hello` and `hello-2`, neither
 * address is ever frozen, and a later reorder swaps the two live URLs behind the
 * author's back. Only stored slugs are compared; a malformed one is reported as
 * malformed instead, since `slugify` folds it before it can collide.
 */
function collectBadSlugs(tree: ResolvedTree): PublishSlugIssue[] {
	const issues: PublishSlugIssue[] = []
	// Stored slugs already claimed under each parent. Top level is `''`, which no
	// pageId can be, so it cannot collide with a real parent's key.
	const claimed = new Map<string, Set<string>>()
	for (const resolved of tree.pages) {
		const stored = resolved.page.slug?.trim()
		if (!stored) continue
		const parentId = resolved.ancestry[resolved.ancestry.length - 1] ?? ''
		const siblings = claimed.get(parentId) ?? new Set<string>()
		claimed.set(parentId, siblings)

		const problem: PublishSlugIssue['problem'] | undefined =
			slugProblem(stored) ??
			(stored.length > MAX_SLUG_LENGTH
				? 'too-long'
				: siblings.has(stored)
					? 'duplicate'
					: undefined)
		// A malformed or over-long slug never gets to claim the name — `slugify`
		// folds it into something else. `add` on a duplicate is a no-op.
		if (!problem || problem === 'duplicate') siblings.add(stored)
		if (!problem) continue
		issues.push({
			pageId: resolved.pageId,
			title: resolved.page.title,
			path: resolved.path,
			slug: stored,
			problem
		})
	}
	return issues
}

/**
 * Published pages claiming a name the node owns.
 *
 * The property panel runs the same check, but only on the page it is showing, so a
 * page nobody opened can still reach a publish with a reserved slug.
 *
 * The two root flags are different questions. `atContainerRoot` is the top of *this
 * document*, wherever it is mounted, gating the container's own generated entries —
 * a document at `/blog` writes `tags/…` too, so a page called "Tags" there would be
 * overwritten. `atRoot` is the top of the *site*, which only a top-level page of the
 * document mounted at `/` reaches, gating the names the node itself serves.
 *
 * A home page pushes a level onto every top-level page's `ancestry` without moving it
 * out of the container root, so "at the container root" is one ancestor deep as well
 * as none. The home page itself claims no slug and is skipped.
 */
function collectReserved(
	tree: ResolvedTree,
	atSiteRoot: boolean,
	homePageId?: string
): PublishReservedIssue[] {
	const issues: PublishReservedIssue[] = []
	for (const resolved of tree.pages) {
		if (resolved.path === '') continue
		// The name the page *asks* for, not the one it ended up with. `uniqueSlug`
		// renames a page that wants a reserved name — its own net, so the container
		// stays well-formed for callers that never read this report — after which
		// `slugOf(resolved.path)` reads `404-page` and this check would go silent on
		// exactly the condition it exists to report.
		const slug = baseSlug(resolved.pageId, resolved.page.title, resolved.page.slug)
		const atContainerRoot =
			resolved.ancestry.length === 0 ||
			(resolved.ancestry.length === 1 && resolved.ancestry[0] === homePageId)
		const reason = reservedSlugReason(slug, {
			atRoot: atSiteRoot && atContainerRoot,
			atContainerRoot
		})
		if (reason) {
			issues.push({
				pageId: resolved.pageId,
				title: resolved.page.title,
				path: resolved.path,
				slug,
				reason
			})
		}
	}
	return issues
}

/**
 * What this publish does to each page, against the last one.
 *
 * `pubAt` is the whole diff basis: a page that has one was live before, and one whose
 * newest edit postdates it has changed since. Coarse on purpose — the alternative is
 * reading the displaced container back and diffing fragments, which costs a blob read
 * and still only says *that* something changed.
 */
function toPageEntry(resolved: ResolvedPage, blocksByPage: BlocksByPage): PublishPageEntry {
	const { page } = resolved
	const publishedAt = page.publishedAt
	const modified = lastModified(resolved, blocksByPage.get(resolved.pageId) ?? [])
	const status: PublishPageStatus = !publishedAt
		? 'new'
		: modified && modified > publishedAt
			? 'updated'
			: 'unchanged'

	return {
		pageId: resolved.pageId,
		title: page.title,
		path: resolved.path,
		archetype: resolved.archetype,
		status,
		// `== null`: a cleared slug is stored as `null` (`updatePage`) and freezes like
		// a never-set one. The home page is the exception — it publishes at the mount
		// root and has no slug to freeze.
		freezesSlug: resolved.path !== '' && page.slug == null
	}
}

/**
 * The pages this container leaves out, and whose decision each one was.
 *
 * The split that matters is the author's own draft against the pages it silently took
 * with it — nobody drafted those, and their URLs are about to 404.
 */
function collectSuppressed(tree: ResolvedTree): PublishSuppressedPage[] {
	const suppressed: PublishSuppressedPage[] = []
	for (const resolved of tree.byId.values()) {
		if (!resolved.suppressed) continue

		let draftedAncestor: string | undefined
		if (!resolved.draft) {
			// Nearest first: the ancestry runs from the top of the tree down, and
			// the draft the author will recognise is the closest one above.
			for (let i = resolved.ancestry.length - 1; i >= 0; i--) {
				const ancestor = tree.byId.get(resolved.ancestry[i])
				if (ancestor?.draft) {
					draftedAncestor = ancestor.page.title
					break
				}
			}
		}

		suppressed.push({
			pageId: resolved.pageId,
			title: resolved.page.title,
			path: resolved.path,
			own: resolved.draft,
			...(draftedAncestor !== undefined && { draftedAncestor })
		})
	}
	return suppressed
}

/**
 * The pages whose place in the tree had to be invented, so the author can put
 * them back where they belong. `resolveTree` already published them at the top
 * level — this only names them.
 */
function collectOrphaned(tree: ResolvedTree): PublishOrphanedPage[] {
	const orphaned: PublishOrphanedPage[] = []
	for (const pageId of tree.orphaned) {
		const resolved = tree.byId.get(pageId)
		if (!resolved || resolved.suppressed) continue
		orphaned.push({ pageId, title: resolved.page.title, path: resolved.path })
	}
	return orphaned
}

/**
 * Read the document and report what publishing it would do.
 *
 * Flush pending debounced writes first: this reads RTDB, so anything still in a timer
 * is reported as the previous revision. `publishSite` does; a lone caller must too.
 */
export async function buildPublishReport(opts: PublishGateOptions): Promise<PublishReport> {
	const [allPages, blocksByPage] = await Promise.all([
		readAllPages(opts.client),
		readAllBlocks(opts.client)
	])
	const tree = resolveTree(allPages, {
		...(opts.homePageId !== undefined && { homePageId: opts.homePageId })
	})

	// A `homePageId` naming a page that no longer exists is the same finding as none
	// at all — `resolveTree` places no root entry for it either.
	const home = opts.homePageId ? allPages.get(opts.homePageId) : undefined

	const refs = [...collectRefs(tree, blocksByPage).values()]
	if (opts.fetchFileInfo) await readVisibilities(refs, opts.fetchFileInfo)

	// With no reader injected nothing can be judged, so nothing is blocked: the
	// gate degrades to a listing rather than refusing every publish.
	// `'P'` is `tActionVisibility`'s Public, the one visibility a published page's
	// anonymous reader can fetch. Compared against the typed value the API already
	// hands back rather than a local copy of the letter.
	const blocked = opts.fetchFileInfo ? refs.filter((ref) => ref.visibility !== 'P') : []
	// A *mount path* (`/`, `/blog`), never a container entry path: `SITE_ROOT_PATH` is
	// the container's own spelling of its root (`index`), which no mount path can equal.
	// `DEFAULT_MOUNT_PATH` is the same `/` the publisher defaults to, so an omitted
	// mount path still assumes the root, the stricter answer this option promises.
	const reserved = collectReserved(
		tree,
		(opts.mountPath ?? DEFAULT_MOUNT_PATH) === '/',
		opts.homePageId
	)
	const badSlugs = collectBadSlugs(tree)
	const pages = tree.pages.map((resolved) => toPageEntry(resolved, blocksByPage))
	const homeDraft = home?.draft === true

	return {
		pages,
		suppressed: collectSuppressed(tree),
		orphaned: collectOrphaned(tree),
		refs,
		blocked,
		reserved,
		badSlugs,
		homeMissing: !home,
		homeDraft,
		empty: pages.length === 0,
		ok: blocked.length === 0 && reserved.length === 0 && badSlugs.length === 0 && !homeDraft
	}
}

/**
 * Delete the blocks carrying a reference, which is what "remove" means here.
 *
 * A media block *is* its reference and an embed block is the embed, so there is
 * nothing left to keep. The open page's editor is subscribed to the same collection
 * and reconciles the removal like any other remote edit.
 */
export async function removeSiteReference(client: RtdbClient, blockIds: string[]): Promise<void> {
	if (blockIds.length === 0) return
	const batch = client.batch()
	for (const blockId of blockIds) {
		batch.delete(client.ref(`b/${blockId}`))
	}
	await batch.commit()
}

// vim: ts=4
