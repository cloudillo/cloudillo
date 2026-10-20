// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FileAccess } from '@cloudillo/core'
import { atom, useAtom } from 'jotai'
import * as React from 'react'

import type { File } from '../types.js'
import { type FileOwnerScopeOverride, useFileOwnerScope } from './useFileOwnerScope.js'

/** Bumped by every `refresh()`: one share change re-fetches every mounted access view (bar slot,
 *  DetailsPanel, ShareDialog), so they never disagree. */
const accessVersionAtom = atom(0)

/** Stands in at the room root, which has no entry: an empty id makes no call. */
const NO_FILE: Pick<File, 'entryId' | 'fileId'> = { entryId: '', fileId: null }

export interface FileAccessState {
	/** `undefined` at the room root, while loading, or after an error */
	access: FileAccess | undefined
	error: boolean
	/** Re-fetch every mounted `useFileAccess` (call after a share change) */
	refresh: () => void
}

/**
 * `GET /files/:id/access` for `file`, on the node that holds it (`useFileOwnerScope`, so remote
 * and cross-owner rows ask the right node). `file` undefined = the room root: no call.
 */
export function useFileAccess(
	file: File | undefined,
	ownerScope?: FileOwnerScopeOverride
): FileAccessState {
	const { api, scopedId, scopeIdTag, resolving } = useFileOwnerScope(file ?? NO_FILE, ownerScope)
	const [version, setVersion] = useAtom(accessVersionAtom)
	const [state, setState] = React.useState<{
		key: string
		access?: FileAccess
		error?: boolean
	}>()
	const key = file && scopedId ? `${scopeIdTag ?? ''}:${scopedId}` : ''

	React.useEffect(
		function loadFileAccess() {
			if (!api || resolving || !key || !scopedId) return
			let cancelled = false
			api.files.access(scopedId).then(
				(access) => {
					if (!cancelled) setState({ key, access })
				},
				(err) => {
					console.error('Failed to load file access', err)
					if (!cancelled) setState({ key, error: true })
				}
			)
			return () => {
				cancelled = true
			}
		},
		[api, resolving, key, scopedId, version]
	)

	const refresh = React.useCallback(() => setVersion((v) => v + 1), [setVersion])
	// A previous file's answer never describes this one; the same file keeps its answer while
	// a refresh is in flight, so the list does not flicker.
	const cur = state?.key === key ? state : undefined
	return { access: cur?.access, error: !!cur?.error, refresh }
}

// vim: ts=4
