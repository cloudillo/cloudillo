// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Publishing a Notillo document as a site container.
 *
 * The browser generates the HTML and the server commits it — Notillo owns the compact
 * format and holds the `RtdbClient`, but its `file:<fileId>` token can create neither
 * the container file nor the site record, so the commit crosses the bus:
 *
 *     site:mount.req { docFileId } -> shell answers the configured mount path
 *       -> flush debounced writes -> read p/* + b/* -> serialize -> zip
 *       -> site:publish.req { blob, docFileId }
 *       -> shell uploads as a managed file and calls POST /api/sites/publish
 *
 * The mount lookup comes first because the container bakes absolute site paths and
 * cannot be relinked afterwards. The path is read, never declared.
 */

import { createApiClient, getAppBus, type PublicProfile } from '@cloudillo/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import type { RefObject } from 'react'

import { buildContainer, type PublishedPageRef } from './container.js'

export type { PublishRef, PublishReport } from './gate.js'
export { buildPublishReport, removeSiteReference } from './gate.js'

export interface PublishSiteOptions {
	client: RtdbClient
	/** The Notillo document being published — the `dbId` of `client`. */
	docFileId: string
	/** Tenant the document belongs to; the app's own idTag for an unowned document. */
	ownerIdTag: string
	/**
	 * The editor's composed flush ref (`NotilloEditor`'s `syncFlushRef`), called before
	 * the read so the newest typing is in RTDB rather than in a debounce timer — both
	 * of them, block writes and the `tg` write the tag listings are built from.
	 * Optional: a read-only mount has no sync effect running.
	 */
	flush?: RefObject<() => void>
	/**
	 * The document's configured mount path, when the caller already has it — the
	 * publish dialog reads it to tell the author where the links will point, so
	 * passing it here saves a second round trip.
	 *
	 * Omitted, `publishSite` asks the shell itself — never defaulted silently, since a
	 * container built for the wrong path is a site of broken links.
	 */
	mountPath?: string
	/**
	 * The page served at the mount root, from the document's settings (`d/site`).
	 *
	 * Read by the caller rather than here: the settings record is already
	 * subscribed to for the sidebar, and the gate the author just confirmed was
	 * built against the same value.
	 */
	homePageId?: string
}

export interface PublishSiteResult {
	containerFileId: string
	pageCount: number
	entries: string[]
	/**
	 * False when the post-commit freeze write failed. The site is live either way,
	 * but the published addresses are not pinned yet, so a later rename can still
	 * move them — publish again.
	 */
	slugsFrozen: boolean
}

/**
 * `GET /profiles/batch` rejects more than this many distinct idTags outright
 * rather than truncating, so the caller batches. A document with more than 64
 * distinct bylines is unlikely, but silently losing every byline past the cap
 * would be invisible until someone read the published page.
 */
const PROFILE_BATCH_SIZE = 64

/** Pages per write batch when freezing slugs, matching `deletePage`'s bound. */
const FREEZE_BATCH_SIZE = 200

/**
 * Freeze what this publish made public: the slug each page went out under, and
 * the moment it first did.
 *
 * A page's address follows its title until it is published and is frozen from then
 * on, so renaming a heading months later cannot silently move a live URL. `pubAt` is
 * written the same way: a listing dates a post by its first publish.
 *
 * `ua` is **not** touched — it is what `lastModified` reads for the "updated" line,
 * and stamping it here would report every first publish as an edit.
 *
 * Runs after the commit, so a failure costs nothing the next publish does not redo.
 */
async function freezePublishedPages(
	client: RtdbClient,
	published: readonly PublishedPageRef[]
): Promise<void> {
	const now = new Date().toISOString()
	const updates: Array<[string, Record<string, unknown>]> = []
	for (const page of published) {
		const update: Record<string, unknown> = {}
		if (!page.slugFixed) update.slug = page.slug
		if (!page.alreadyPublished) update.pubAt = now
		if (Object.keys(update).length > 0) updates.push([page.pageId, update])
	}

	for (let i = 0; i < updates.length; i += FREEZE_BATCH_SIZE) {
		const batch = client.batch()
		for (const [pageId, update] of updates.slice(i, i + FREEZE_BATCH_SIZE)) {
			batch.update(client.ref(`p/${pageId}`), update)
		}
		await batch.commit()
	}
}

/**
 * Publish the open document.
 *
 * There is no gate here: slug validation and the check for whether this document
 * may be published at all live elsewhere. This is the pipeline, not the policy.
 */
export async function publishSite(opts: PublishSiteOptions): Promise<PublishSiteResult> {
	// Synchronous and best-effort, exactly as on teardown: the writes are sent,
	// not awaited. The read below goes through the same socket in the same order,
	// so the server has applied them by the time it answers. Covers the block
	// debounce and the tag debounce both — see `PublishSiteOptions.flush`.
	opts.flush?.current?.()

	// The publisher has no viewport, so it cannot pick an image variant the way the
	// editor does — it reads which renditions each referenced file actually has and
	// emits the whole `srcset` ladder. It also bakes each page's byline, which is a
	// profile lookup. Both are plain API reads against the owning tenant, so they go
	// through an API client rather than the bus.
	const bus = getAppBus()
	const api = createApiClient({ idTag: opts.ownerIdTag, authToken: bus.accessToken })

	// `/profiles/batch` is the one `/profiles/*` route that accepts a file-scoped
	// token, which is all Notillo has — see its doc comment in `api-client.ts`.
	const fetchProfiles = async (idTags: string[]): Promise<PublicProfile[]> => {
		const batches: Promise<PublicProfile[]>[] = []
		for (let i = 0; i < idTags.length; i += PROFILE_BATCH_SIZE) {
			batches.push(api.profiles.getBatch(idTags.slice(i, i + PROFILE_BATCH_SIZE)))
		}
		return (await Promise.all(batches)).flat()
	}

	// Before the build, not after: every href in the container is absolute and
	// baked from this. A failure here fails the publish rather than falling back
	// to `/`, because a container that silently claims the root would either be
	// rejected by the backend or, worse, take the root from the document that
	// owns it.
	const mountPath =
		opts.mountPath ?? (await bus.resolveSiteMount({ docFileId: opts.docFileId })).mountPath

	const container = await buildContainer({
		client: opts.client,
		ownerIdTag: opts.ownerIdTag,
		mountPath,
		...(opts.homePageId !== undefined && { homePageId: opts.homePageId }),
		fetchDescriptor: (fileId) => api.files.getDescriptor(fileId),
		fetchProfiles
	})

	const { containerFileId } = await bus.publishSite({
		blob: container.blob,
		docFileId: opts.docFileId
	})

	// The site is live at this point, so nothing below may fail the publish. It is
	// still reported: without the freeze the live addresses follow the titles, and
	// the author is the only one who can notice a rename moving one.
	let slugsFrozen = true
	try {
		await freezePublishedPages(opts.client, container.published)
	} catch (err) {
		console.error('[Notillo] Could not freeze published slugs:', err)
		slugsFrozen = false
	}

	return {
		containerFileId,
		pageCount: container.pageCount,
		entries: container.entries,
		slugsFrozen
	}
}

// vim: ts=4
