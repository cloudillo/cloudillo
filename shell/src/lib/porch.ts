// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry } from '@cloudillo/core'
import * as React from 'react'

import { useApiContext } from '../context/index.js'

/** In-flight porch loads, so the feed, the composer and the room picker share one GET. */
const inflight = new Map<string, Promise<PorchEntry[]>>()

/**
 * The tenant's porch (`GET /api/channels` on its own node): through the context token when the
 * user has one for it, else the public tier. Reloads once `communityRoles` land, since that
 * means a token did too.
 */
export function usePorch(idTag: string | undefined, communityRoles?: string[]) {
	const { getClientFor } = useApiContext()
	const [rooms, setRooms] = React.useState<PorchEntry[]>()
	const [error, setError] = React.useState(false)
	const [version, setVersion] = React.useState(0)
	// Another tenant: drop the previous one's rooms during render, not in the effect,
	// so they never flash. A reload of the same tenant keeps showing the old list.
	const [prevIdTag, setPrevIdTag] = React.useState(idTag)
	if (prevIdTag !== idTag) {
		setPrevIdTag(idTag)
		setRooms(undefined)
		setError(false)
	}
	const rolesKey = communityRoles?.join(',')

	React.useEffect(
		function loadPorch() {
			if (!idTag) return
			const client = getClientFor(idTag, { auth: 'preferred' })
			if (!client) return
			const key = `${idTag}|${rolesKey}|${version}`
			let req = inflight.get(key)
			if (!req) {
				req = client.channels.list().finally(() => inflight.delete(key))
				inflight.set(key, req)
			}
			let cancelled = false
			req.then((list) => {
				if (cancelled) return
				setRooms(list)
				setError(false)
			}).catch((err) => {
				console.error('Failed to load rooms:', err)
				// Keep the last good list (or none): `[]` would read as "every room is gone"
				if (!cancelled) setError(true)
			})
			return () => {
				cancelled = true
			}
		},
		[idTag, getClientFor, rolesKey, version]
	)

	return { rooms, error, reload: React.useCallback(() => setVersion((v) => v + 1), []) }
}

// vim: ts=4
