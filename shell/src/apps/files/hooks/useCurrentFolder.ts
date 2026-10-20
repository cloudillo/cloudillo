// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import * as React from 'react'

import type { File } from '../types.js'
import { MANAGED_FOLDER_ID, TRASH_FOLDER_ID } from '../types.js'
import { convertFileView } from './useFileList.js'

/**
 * The folder being browsed, as a `File` (for Share / ⓘ in the bar). `api` is the serving node —
 * `remoteApi` while remote-browsing. No call at the room root or for a Trash/Managed sentinel.
 */
export function useCurrentFolder(
	folderId: string | null,
	api: ApiClient | null | undefined
): File | undefined {
	const [folder, setFolder] = React.useState<File | undefined>()

	React.useEffect(() => {
		setFolder(undefined)
		if (!api || !folderId || folderId === TRASH_FOLDER_ID || folderId === MANAGED_FOLDER_ID)
			return
		let cancelled = false
		api.files
			.getMetadata(folderId)
			.then((res) => {
				if (!cancelled) setFolder(convertFileView(res))
			})
			.catch((err) => console.error('[Files] current folder metadata failed', err))
		return () => {
			cancelled = true
		}
	}, [api, folderId])

	return folder
}

// vim: ts=4
