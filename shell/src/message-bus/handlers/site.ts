// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Site Publish Message Handlers for Shell
 *
 * Notillo builds the site container — it owns the document format and holds the
 * RTDB connection — but its token is scoped `file:<fileId>`, so it can neither
 * create the container file nor write the site record. This handler is the other
 * half: it takes the finished zip off the bus, uploads it as a managed Public
 * file, and asks the backend to commit it.
 *
 * The mount lookup (`site:mount.req`) is here for the same reason the upload is:
 * `/api/sites` is `require_leader` and the app's token is scoped to one file. The
 * publisher needs the answer *before* it builds, because a container bakes absolute
 * site paths.
 *
 * Both messages are closed to all but the app named in `SITE_PUBLISHERS` below, and
 * both act on the **document's owner tenant** — taken from the resId half the shell
 * attested, never the signed-in user's, see `siteApiFor`.
 */

import { getApiClient, hasApiToken, type SiteMountReq, type SitePublishReq } from '@cloudillo/core'

import type { AppConnection } from '../app-tracker.js'
import type { ShellMessageBus } from '../shell-bus.js'

/** Preset the container uploads under. Stores the zip as-is, no variants. */
const SITE_PRESET = 'site'

/**
 * Which apps may publish a site container.
 *
 * A stopgap, not a permission model. `site:publish.req` hands the shell bytes that are
 * then served as HTML from the site owner's own origin, and the app composing them runs
 * inside a sandboxed, opaque-origin iframe the shell does not trust. Until apps carry
 * declared permissions, the surface is closed to everything but the one app that owns
 * the site document format.
 *
 * `connection.appName` is the launcher's name, recorded by the shell at registration and
 * never the iframe's own claim — see `handlers/auth.ts` where it is stamped from
 * `pending.appName`.
 *
 * What actually vets the bytes is on the server: `cloudillo-file`'s `site_html` walks
 * every HTML entry of a container uploaded under preset `site` against an
 * element/attribute allowlist and fails the upload on anything outside it. That is why
 * neither the publisher nor the shell sanitizes any more.
 */
const SITE_PUBLISHERS = new Set(['notillo'])

/**
 * Composed, never taken from the app: it becomes a path segment of the upload URL,
 * and the one variable part has already been matched against the connection's resId.
 */
function containerFileName(docFileId: string): string {
	return `site-${encodeURIComponent(docFileId)}.zip`
}

/**
 * The document a connection is allowed to act on, and the tenant that owns it.
 *
 * Never the one the app names. `resId` is `ownerTag:fileId`, composed by the shell
 * from the route at registration (`shell/src/apps/index.tsx`), so it is the only
 * trustworthy id in these exchanges; the claimed id is accepted only when it agrees.
 * That makes the owner half the only value here that names the document's
 * **tenant** — `connection.idTag` looks like it would, but the registration sets it
 * to the signed-in user first.
 *
 * Split on the FIRST colon only, as `shell-embed.ts` does: a fileId may contain one,
 * an idTag may not. An embed connection's resId is `_embed:<nonce>`, which no claimed
 * docFileId can agree with — intentionally, since an embedded viewer must not publish
 * the site it is being read from.
 */
function authorizedDocFileId(
	resId: string | undefined,
	claimed: string
): { ownerTag: string; docFileId: string } | undefined {
	const colon = resId ? resId.indexOf(':') : -1
	if (!resId || colon <= 0) return undefined
	const ownerTag = resId.slice(0, colon)
	const docFileId = resId.slice(colon + 1)
	if (!ownerTag || !docFileId || claimed !== docFileId) return undefined
	return { ownerTag, docFileId }
}

/** Is this connection allowed on the site surface at all? One test for both messages. */
function isSitePublisher(connection: AppConnection): boolean {
	return !!connection.appName && SITE_PUBLISHERS.has(connection.appName)
}

/**
 * The API client for the tenant that owns the document, not for the signed-in user.
 *
 * `api.site.*` is tenant-relative (see its docstring in `libs/core/src/api-client.ts`)
 * and `bus.getApi()` is always the personal tenant — so a community's document would
 * publish to the *user's* node. `getApiClient(ownerTag)` is what `useContextAwareApi`
 * resolves to, so nothing here needs a hook.
 */
function siteApiFor(bus: ShellMessageBus, ownerTag: string) {
	if (!ownerTag) return bus.getApi()
	return hasApiToken(ownerTag) ? getApiClient(ownerTag) : undefined
}

export function initSiteHandlers(bus: ShellMessageBus): void {
	bus.on('site:publish.req', async (msg: SitePublishReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Site] Publish request with no source window')
			return
		}

		const fail = (error: string) => {
			bus.sendResponse(appWindow, 'site:publish.res', msg.id, false, undefined, error)
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Site] Publish request from uninitialized/unknown app')
			fail('App not initialized')
			return
		}

		if (!isSitePublisher(connection)) {
			console.error(
				'[Site] Publish request from an app that may not publish:',
				connection.appName
			)
			fail('This app may not publish a site')
			return
		}

		// Publishing replaces what the site serves, which is a write in every sense a
		// read-only mount understands.
		if (connection.access !== 'write') {
			console.error('[Site] Publish request from a read-only connection')
			fail('Read-only access')
			return
		}

		const authorized = authorizedDocFileId(connection.resId, msg.payload.docFileId)
		if (!authorized) {
			console.error(
				'[Site] Publish request does not match the connection:',
				msg.payload.docFileId,
				'vs',
				connection.resId
			)
			fail('Publish request does not match the open document')
			return
		}
		const { ownerTag, docFileId } = authorized

		// `blob` crosses the bus by structured clone and arrives as `T.unknown`,
		// so nothing has checked its type yet.
		const blob = msg.payload.blob
		if (!(blob instanceof Blob)) {
			console.error('[Site] Publish payload carries no Blob')
			fail('Publish payload is not a Blob')
			return
		}

		const api = siteApiFor(bus, ownerTag)
		if (!api) {
			fail('Not authenticated')
			return
		}

		try {
			console.log('[Site] Uploading container for', ownerTag, docFileId, blob.size, 'bytes')

			// `as: 'managed'` keeps the container out of the file library and under the
			// GC's reachability rules; `visibility: 'P'` is what lets an unauthenticated
			// reader fetch a page out of it — the source document stays private.
			//
			// The content type is what a site page's search hit carries, so it names the
			// format and not just the envelope: `application/zip` would make every
			// uploaded zip look like a site.
			const uploaded = await api.files.uploadBlob(
				SITE_PRESET,
				containerFileName(docFileId),
				blob,
				'application/vnd.cloudillo.site+zip',
				{ as: 'managed', visibility: 'P' }
			)

			const containerFileId = uploaded.fileId
			console.log('[Site] Container uploaded as', containerFileId, 'committing')

			// The commit is server-side: it is the only place the pointer flip, the
			// search rows and the authorization check can happen together. Until it
			// returns, the container is an orphan the GC would reap.
			await api.site.publish({ docFileId, containerFileId })

			console.log('[Site] Published', docFileId, '->', containerFileId)
			bus.sendResponse(appWindow, 'site:publish.res', msg.id, true, { containerFileId })
		} catch (err) {
			console.error('[Site] Publish failed:', err)
			fail(err instanceof Error ? err.message : 'Publish failed')
		}
	})

	bus.on('site:mount.req', async (msg: SiteMountReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Site] Mount request with no source window')
			return
		}

		const fail = (error: string) => {
			bus.sendResponse(appWindow, 'site:mount.res', msg.id, false, undefined, error)
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Site] Mount request from uninitialized/unknown app')
			fail('App not initialized')
			return
		}

		// The same lock the publish handler carries, but **no `access === 'write'`
		// check**: the publisher resolves the mount path on load from a read-only
		// mount too (`apps/notillo/src/app.tsx`), to decide whether to offer
		// publishing at all.
		if (!isSitePublisher(connection)) {
			console.error(
				'[Site] Mount request from an app that may not read it:',
				connection.appName
			)
			fail('This app may not read the site mount')
			return
		}

		const authorized = authorizedDocFileId(connection.resId, msg.payload.docFileId)
		if (!authorized) {
			console.error(
				'[Site] Mount request does not match the connection:',
				msg.payload.docFileId,
				'vs',
				connection.resId
			)
			fail('Mount request does not match the open document')
			return
		}
		const { ownerTag, docFileId } = authorized

		const api = siteApiFor(bus, ownerTag)
		if (!api) {
			fail('Not authenticated')
			return
		}

		try {
			// The **configured** path, so a repathed row answers with where the
			// next publish will land rather than where the live container sits —
			// which is exactly the container this call is about to build.
			const config = await api.site.get()
			const doc = config.docs.find((d) => d.docFileId === docFileId)

			// No row is answered, not refused — the publisher needs `mounted` to tell
			// the author why publishing is unavailable. `mountPath` is only ever a
			// path to *build against*, so its fallback must be a mount path (`/`) and
			// not `SITE_ROOT_PATH`, which is the container's own entry name and which
			// `normalize_mount_path` rejects for want of a leading slash — after the
			// container has already been uploaded.
			bus.sendResponse(appWindow, 'site:mount.res', msg.id, true, {
				mountPath: doc?.mountPath ?? '/',
				mounted: !!doc
			})
		} catch (err) {
			console.error('[Site] Mount lookup failed:', err)
			fail(err instanceof Error ? err.message : 'Mount lookup failed')
		}
	})
}

// vim: ts=4
