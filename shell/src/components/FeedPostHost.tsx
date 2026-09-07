// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Bridges `feed:post.req` to the feed composer.
 *
 * The bus handler knows which document asked, but has no React context; this has
 * both. It resolves the file row for the `contentType` an LDOC post needs, parks
 * the intent in `pendingDocPostAtom` for `FeedApp` to consume once, and navigates
 * to the feed — which unmounts the requesting iframe, hence the plain
 * request/response shape of the message.
 *
 * Reads `useCtx()` itself rather than taking a base prop, as `QrScanner` in
 * `layout.tsx` does: `Layout` mounts the `<CtxProvider>` and is therefore above it.
 */

import { useAuth } from '@cloudillo/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchRow, resolveDocInfo } from '../apps/doc-info.js'
import { pendingDocPostAtom } from '../apps/feed/doc-post-intent.js'
import { isSameDoc } from '../apps/feed/live-doc.js'
import {
	activeContextAtom,
	contextRolesAtom,
	useContextAwareApi,
	useCtx,
	useCurrentContextIdTag
} from '../context/index.js'
import {
	clearFeedPostCallback,
	type FeedPostCallback,
	setFeedPostCallback
} from '../message-bus/handlers/feed.js'
import { feedPath } from '../routes.js'

export function FeedPostHost() {
	const navigate = useNavigate()
	const ctx = useCtx()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const [activeContext] = useAtom(activeContextAtom)
	const contextRolesMap = useAtomValue(contextRolesAtom)
	const setPendingDocPost = useSetAtom(pendingDocPostAtom)

	const contextRoles = React.useMemo(
		() =>
			activeContext?.roles ?? (contextIdTag ? (contextRolesMap.get(contextIdTag) ?? []) : []),
		[activeContext?.roles, contextRolesMap, contextIdTag]
	)

	React.useEffect(() => {
		const callback: FeedPostCallback = async ({ srcIdTag, fileId }) => {
			// `DocPostIntent` is the LDOC content minus the commentary, which the
			// user writes in the composer.
			const { row } = await fetchRow(api, fileId)
			// fileIds are node-local: a row that merely shares the id is a different document,
			// and its contentType would be baked into the published post. `canPost` is the same
			// predicate the DocBar hides its button on — restated here because the bus is the
			// trust boundary and the DocBar is not.
			const info = resolveDocInfo({
				resId: `${srcIdTag}:${fileId}`,
				localRow: row,
				authIdTag: auth?.idTag,
				contextIdTag,
				contextRoles
			})
			if (!row?.contentType || !isSameDoc(row, { srcIdTag }, api?.idTag) || !info.canPost) {
				throw new Error('Cannot share this document')
			}

			setPendingDocPost({
				doc: `${srcIdTag}:${fileId}`,
				contentType: row.contentType,
				title: row.fileName
			})
			navigate(feedPath(ctx.base))
		}
		setFeedPostCallback(callback)

		return () => clearFeedPostCallback(callback)
	}, [api, ctx.base, navigate, setPendingDocPost, auth?.idTag, contextIdTag, contextRoles])

	return null
}

// vim: ts=4
