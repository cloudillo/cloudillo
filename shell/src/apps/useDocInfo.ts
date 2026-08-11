// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document info resolution for the app DocBar.
 *
 * Answers, for the resource an app iframe was launched with: what is it called,
 * who owns the content, whose node serves the row we can act on, and may we
 * rename it. The app cannot work this out itself — it holds one scoped token for
 * one node, while a pinned or placed foreign-owned document exists twice: as a
 * local row here and as the origin on the owner's node.
 */

import { type ApiClient, createApiClient, type DocInfo, type FileView } from '@cloudillo/core'
import { useAuth } from '@cloudillo/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'

import {
	activeContextAtom,
	contextRolesAtom,
	fileViewUpdateAtom,
	useApiContext,
	useContextAwareApi,
	useCurrentContextIdTag
} from '../context/index.js'
import { fileIdFromResId, idTagFromResId } from '../message-bus/handlers/resId.js'
import {
	clearDocInfoResolver,
	type DocInfoResolver,
	setDocInfoResolver
} from '../message-bus/index.js'
import { documentTitleAtom } from '../title.js'
import { isPermissionError } from '../utils.js'
import { fetchRow, resolveDocInfo, type RowResult } from './doc-info.js'

/**
 * Back-off before each successive re-attempt at a row fetch nobody answered. A
 * blip must not cost the rename button for the session; an unreachable node must
 * not be polled forever. Once the budget is spent the bar says 'unavailable'
 * rather than spinning.
 */
const ROW_RETRY_DELAYS_MS = [3000, 10_000, 30_000]

/**
 * Resolve document info for `resId`, keep the shell's document title in step
 * with it, and serve the app's `doc:info.req` / `doc:rename.req`.
 *
 * @param appToken the file-scoped token the iframe was handed, if any. Only
 *   consulted when there is no session to fetch the row with — see `rowApi`.
 * @returns the current info, for the caller to push over the bus
 */
export function useDocInfo(resId: string | undefined, appToken?: string): DocInfo | undefined {
	const { getClientFor } = useApiContext()
	const { api: contextApi } = useContextAwareApi()
	const contextIdTag = useCurrentContextIdTag()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const contextRolesMap = useAtomValue(contextRolesAtom)
	const [fileViewUpdate, setFileViewUpdate] = useAtom(fileViewUpdateAtom)
	const setDocumentTitle = useSetAtom(documentTitleAtom)
	const [info, setInfo] = React.useState<DocInfo | undefined>(undefined)
	// Retry budget for a failed row fetch. Keyed on the document rather than reset
	// from an effect, so opening another document starts fresh without the extra
	// render (and second fetch) a plain `setRetry(0)` would cost.
	const [retry, setRetry] = React.useState<{ resId: string; n: number }>({ resId: '', n: 0 })
	const retryCount = retry.resId === resId ? retry.n : 0

	const contextRoles = React.useMemo(
		() =>
			activeContext?.roles ?? (contextIdTag ? (contextRolesMap.get(contextIdTag) ?? []) : []),
		[activeContext?.roles, contextRolesMap, contextIdTag]
	)

	/**
	 * The client the row is fetched with when there is no session.
	 *
	 * `contextApi` is the shell's own client, which for a share-link guest carries
	 * no session at all: the row fetch 403s and the DocBar can only ever resolve to
	 * `unavailable` — nameless bar, no tab title. The one credential that CAN read
	 * the row is the file-scoped token minted for the iframe, aimed at the
	 * document's own node (the only node it is good for).
	 *
	 * It buys reads of the ORIGIN only, so `resolveRows` routes the answer to
	 * `remoteRow` and leaves `localApiRef` empty; `resolveDocInfo` additionally
	 * refuses `canRename` outright without an authenticated idTag.
	 */
	const guestApi = React.useMemo(() => {
		if (auth?.idTag || !appToken || !resId) return null
		const nodeTag = idTagFromResId(resId) ?? contextIdTag
		return nodeTag ? createApiClient({ idTag: nodeTag, authToken: appToken }) : null
	}, [auth?.idTag, appToken, resId, contextIdTag])
	const rowApi = guestApi ?? contextApi

	// The client that produced the local row is the one a rename must go back to,
	// and the row itself is what gets broadcast to any open Files list afterwards.
	const localApiRef = React.useRef<ApiClient | null>(null)
	const localRowRef = React.useRef<FileView | undefined>(undefined)
	const infoRef = React.useRef<DocInfo | undefined>(undefined)
	infoRef.current = info

	// Only an update to THIS file is worth a refetch. Keyed on the version so a
	// second change to the same file still re-runs; a change to any other file in
	// the shell is invisible here rather than costing every open app a round trip.
	const targetFileId = resId ? (fileIdFromResId(resId) ?? resId) : undefined
	const refreshVersion =
		fileViewUpdate && fileViewUpdate.file.fileId === targetFileId ? fileViewUpdate.version : 0

	React.useEffect(
		function resolveRows() {
			if (!resId) {
				setInfo(undefined)
				return
			}
			const ownerTag = idTagFromResId(resId)
			const fileId = fileIdFromResId(resId) ?? resId
			let cancelled = false
			const cleanups: Array<() => void> = []

			setInfo((prev) =>
				prev?.resId === resId
					? prev
					: {
							resId,
							fileId,
							state: 'loading',
							isCrossOwner: false,
							canRename: false
						}
			)
			;(async function () {
				const isGuestFetch = !!guestApi && rowApi === guestApi
				const fetched = await fetchRow(rowApi, fileId)
				if (cancelled) return
				// A guest's row comes from the DOCUMENT's node, not from the node we
				// are standing on: it is the ORIGIN, so it may be displayed but never
				// renamed.
				const local: RowResult = isGuestFetch ? { ...fetched, row: undefined } : fetched
				localApiRef.current = local.row ? rowApi : null
				localRowRef.current = local.row

				// Ask the origin — for display only — only when the local node
				// genuinely has no row. A local lookup that FAILED says nothing about
				// whether the row exists, so it is no reason to go asking; a REFUSED
				// one is, since the origin may answer what we may not read here. The
				// guest path already holds the origin row, so do not fetch it twice.
				let remote: RowResult | undefined = isGuestFetch ? fetched : undefined
				const localAnswered = !local.failed || local.denied
				if (
					!isGuestFetch &&
					!local.row &&
					localAnswered &&
					ownerTag &&
					ownerTag !== contextIdTag
				) {
					remote = await fetchRow(getClientFor(ownerTag, { auth: 'preferred' }), fileId)
					if (cancelled) return
				}

				const resolved = resolveDocInfo({
					resId,
					localRow: local.row,
					remoteRow: remote?.row,
					authIdTag: auth?.idTag,
					contextIdTag,
					contextRoles
				})

				const failed = local.failed || remote?.failed
				if (
					failed &&
					!local.row &&
					!remote?.row &&
					retryCount < ROW_RETRY_DELAYS_MS.length
				) {
					// Nobody said this document is missing, so do not say so while we
					// still mean to ask again: keep a good answer if we have one,
					// otherwise hold the loading skeleton rather than downgrading to
					// 'unavailable' on an unanswered request.
					setInfo((prev) =>
						prev?.resId === resId && prev.state === 'ready'
							? prev
							: { ...resolved, state: 'loading' }
					)
					const timer = setTimeout(
						() => setRetry({ resId, n: retryCount + 1 }),
						ROW_RETRY_DELAYS_MS[retryCount]
					)
					cleanups.push(() => clearTimeout(timer))
					return
				}

				// Somebody answered, or the retry budget is spent. Falling through with
				// no row resolves to 'unavailable': holding the skeleton with no timer
				// left to fire would be a spinner that never stops.
				setInfo(resolved)
			})()

			return () => {
				cancelled = true
				for (const cleanup of cleanups) cleanup()
			}
		},
		[
			resId,
			rowApi,
			guestApi,
			getClientFor,
			contextIdTag,
			auth?.idTag,
			contextRoles,
			refreshVersion,
			retryCount
		]
	)

	// Keep the shell's document title in step, off this same local-first fetch, so
	// the title and the DocBar cannot show different names.
	React.useEffect(
		function syncDocumentTitle() {
			if (!resId) return
			const fileName = info?.resId === resId ? info.fileName : undefined
			if (!fileName) return
			setDocumentTitle((prev) => {
				// An app that took over the title for this document keeps it.
				if (prev.resId === resId && prev.appManaged) return prev
				return { resId, title: fileName }
			})
		},
		[resId, info, setDocumentTitle]
	)

	// Clearing is keyed on the document alone: a cleanup that also ran on every
	// `info` change would wipe an app-managed title (and its dirty marker) on
	// every rename, pin or Files-list bump, and the guard above would then see
	// an empty title and overwrite it with the file name.
	React.useEffect(
		function clearDocumentTitle() {
			if (!resId) return
			return () => {
				setDocumentTitle((prev) => (prev.resId === resId ? {} : prev))
			}
		},
		[resId, setDocumentTitle]
	)

	// Serve doc:info.req / doc:rename.req for as long as this document is open.
	React.useEffect(
		function registerResolver() {
			if (!resId) return
			const resolver: DocInfoResolver = {
				async getInfo(requestedResId) {
					return requestedResId === resId ? infoRef.current : undefined
				},
				async rename(requestedResId, fileName) {
					if (requestedResId !== resId) return { ok: false, error: 'Unknown document' }
					const current = infoRef.current
					const api = localApiRef.current
					const row = localRowRef.current
					// The resolver is re-registered synchronously on the render where
					// `resId` changes, but the three refs above are only rewritten
					// once `resolveRows`' fetch returns. In that window they still
					// describe the PREVIOUS document, and `current.fileId` would aim
					// the rename at it.
					if (current?.resId !== resId) return { ok: false, error: 'Document not ready' }
					if (!current.canRename || !api || !row) {
						return { ok: false, error: 'Rename not permitted' }
					}
					try {
						await api.files.update(current.fileId, { fileName })
					} catch (err) {
						console.error('[DocInfo] Rename failed', err)
						return {
							ok: false,
							error: isPermissionError(err)
								? 'You do not have permission to rename this file.'
								: 'Failed to rename file'
						}
					}
					// Push the new name everywhere that shows it: the local info (hence
					// the doc:info.push), the tab title, and any open Files list.
					const renamed = { ...row, fileName }
					localRowRef.current = renamed
					setInfo((prev) => (prev?.resId === resId ? { ...prev, fileName } : prev))
					setDocumentTitle((prev) =>
						prev.resId === resId ? { ...prev, title: fileName } : prev
					)
					setFileViewUpdate((prev) => ({
						version: (prev?.version ?? 0) + 1,
						file: renamed
					}))
					return { ok: true, fileName }
				}
			}
			setDocInfoResolver(resolver)
			// Owner-checked: never clear a resolver another container registered.
			return () => {
				clearDocInfoResolver(resolver)
			}
		},
		[resId, setDocumentTitle, setFileViewUpdate]
	)

	return info
}

// vim: ts=4
