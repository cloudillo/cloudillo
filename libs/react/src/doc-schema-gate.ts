// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { getAppBus } from '@cloudillo/core'
import { checkDocSchema } from '@cloudillo/crdt'
import * as React from 'react'
import type * as Y from 'yjs'

import type { useCloudilloEditor } from './hooks.js'

type Editor = ReturnType<typeof useCloudilloEditor>

/**
 * Lock a Yjs document read-only while its schema is unknown (not yet synced) or newer than
 * `supported`. The returned editor reports `access: 'read'`; once synced and newer, the bus is
 * also capped to `'comment'` so the doc bar, comments and every other `getAppBus().access` reader agree —
 * comments live in RTDB and never rewrite the document.
 */
export function useDocSchemaGate(editor: Editor, m: Y.Map<unknown>, supported: number): Editor {
	const subscribe = React.useCallback(
		(cb: () => void) => {
			m.observe(cb)
			return () => m.unobserve(cb)
		},
		[m]
	)
	const schema = React.useSyncExternalStore(subscribe, () => checkDocSchema(m, supported))
	const ro = !editor.synced || schema === 'ro'
	// The bus cap drives the doc bar's "newer version" badge, so it waits for the sync: an
	// unsynced doc is read-only too, but showing that badge on every open would be a lie.
	const newer = editor.synced && schema === 'ro'

	React.useEffect(() => {
		if (!newer) return
		getAppBus().capAccess('comment')
		return () => getAppBus().capAccess(undefined)
	}, [newer])

	return React.useMemo(() => (ro ? { ...editor, access: 'read' as const } : editor), [editor, ro])
}

// vim: ts=4
