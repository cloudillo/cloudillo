// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'
import { useCallback, useEffect, useRef, useState } from 'react'

import { decodeDocSettings, type StoredDocSettings } from '../rtdb/types.js'

/** Where the document's own settings live — one record, outside `p` and `b`. */
const DOC_SETTINGS_PATH = 'd/site'

export interface DocSettingsData {
	settings: StoredDocSettings
	/** The first snapshot has arrived, so an empty `settings` means empty. */
	ready: boolean
	error?: Error
	save(patch: Partial<StoredDocSettings>): Promise<void>
	retry(): void
}

/**
 * The document's settings, live.
 *
 * A subscription rather than the one-shot read `usePageProperties` uses. That hook
 * is one-shot to protect in-flight typing in its text fields; there are no text
 * fields here, and the home flag decides the sidebar's shape for every collaborator
 * — a change has to propagate rather than wait for the next reload.
 *
 * A document that has never had site mode turned on has no record at all, which is
 * why `ready` is reported separately: an empty `settings` is the answer, not the
 * absence of one, and the caller must not paint a site UI before it knows which.
 */
export function useDocSettings(client: RtdbClient | undefined): DocSettingsData {
	const [settings, setSettings] = useState<StoredDocSettings>({})
	const [ready, setReady] = useState(false)
	const [error, setError] = useState<Error | undefined>()
	const [retryCount, setRetryCount] = useState(0)
	// Whether the record exists, so `save` knows whether to create or to patch.
	// Three states, not two: `undefined` is "we do not know" — before the first
	// snapshot, or after one failed — and only a *known* absence may create.
	// A ref rather than state: `save` reads it at call time and must not be
	// recreated — nor go stale — when a snapshot flips it.
	const existsRef = useRef<boolean | undefined>(undefined)

	const retry = useCallback(() => setRetryCount((n) => n + 1), [])

	useEffect(() => {
		if (!client) {
			setSettings({})
			setReady(false)
			setError(undefined)
			existsRef.current = undefined
			return
		}

		setError(undefined)

		const unsubscribe = client.ref<StoredDocSettings>(DOC_SETTINGS_PATH).onSnapshot(
			(snapshot) => {
				existsRef.current = snapshot.exists
				// An unreadable record is treated as no record: the document keeps
				// working as an ordinary wiki rather than failing to open.
				const data = snapshot.exists ? decodeDocSettings(snapshot.data()) : undefined
				setSettings(data ?? {})
				setReady(true)
				setError(undefined)
			},
			(err) => {
				console.error('[Notillo] Document settings read failed:', err)
				setError(err)
				// `existsRef` deliberately left `undefined`: a read that failed knows
				// nothing about whether the record is there, and `save` must not
				// create over it on that basis.
				// Still ready: the caller has its answer — there is no site config it
				// can see — and a spinner that never resolves would be worse.
				setReady(true)
			}
		)

		return unsubscribe
	}, [client, retryCount])

	const save = useCallback(
		async (patch: Partial<StoredDocSettings>) => {
			if (!client) return
			const ref = client.ref<StoredDocSettings>(DOC_SETTINGS_PATH)
			// `update` unless the record is *known* absent, so a field this build
			// does not know about survives a write from an older Notillo. `set`
			// only on the very first write, which is the one that has to create it
			// — and never on a mere "we could not read it", where replacing the
			// record would drop every field the failed snapshot would have named.
			// An `update` against a record that is not there is the safe way to be
			// wrong: it cannot destroy a field.
			// Decided and marked *before* the await: two saves issued inside one
			// round trip would otherwise both read "absent" and both `set`, and the
			// second `set` replaces the record the first one created. Toggling site
			// mode and then picking a home page fast enough leaves `d/site` holding
			// only `homePageId`, which switches the site UI back off.
			// If the `set` rejects, this leaves the ref optimistically `true` and a
			// retry patches instead of creating — the safe way to be wrong, above.
			const creating = existsRef.current === false
			existsRef.current = true
			if (creating) await ref.set(patch)
			else await ref.update(patch)
			// Folded in locally so the sidebar reshapes on the click rather than on
			// the echo. The subscription overwrites this with the stored truth.
			setSettings((prev) => ({ ...prev, ...patch }))
		},
		[client]
	)

	return { settings, ready, error, save, retry }
}

// vim: ts=4
