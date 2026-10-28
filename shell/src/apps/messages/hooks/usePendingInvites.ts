// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useApi, useAuth } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'

import { useWsBus } from '../../../ws-bus.js'

export interface UsePendingInvites {
	pendingInvites: ActionView[] | undefined
	// The last load failed (`pendingInvites` is then `[]`); `reload` retries.
	error: boolean
	reload: () => void
	// Accept an invite; resolves to the invite's subject (CONV id) so the caller can
	// navigate to the new group. Rejects on failure — the caller reports it.
	acceptInvite: (invite: ActionView) => Promise<string | undefined>
	// Rejects on failure — the caller reports it.
	rejectInvite: (invite: ActionView) => Promise<void>
}

// Incoming group invitations where the current user is the invitee (INVT
// status 'C', audience = me), with the CONV embedded (`subjectAction`) when known.
export function usePendingInvites(): UsePendingInvites {
	const { api } = useApi()
	const [auth] = useAuth()
	const [pendingInvites, setPendingInvites] = React.useState<ActionView[] | undefined>()
	const [error, setError] = React.useState(false)
	const [reloadKey, setReloadKey] = React.useState(0)

	React.useEffect(
		function loadPendingInvites() {
			if (!auth?.idTag || !api) return
			const ac = new AbortController()
			;(async function () {
				try {
					// Server-filter to invites addressed to me (audience = me);
					// the audience filter replaces the former client-side pass.
					const invites = await api.actions.list({
						type: 'INVT',
						status: 'C', // Only pending confirmations
						audience: auth.idTag,
						includeSubject: true
					})
					if (ac.signal.aborted) return
					setPendingInvites(invites as ActionView[])
					setError(false)
				} catch (err) {
					if (ac.signal.aborted) return
					console.error('Failed to load pending invites', err)
					setPendingInvites([])
					setError(true)
				}
			})()
			return () => ac.abort()
		},
		// `auth?.idTag`, not `auth`: a token renewal replaces the auth object.
		[auth?.idTag, api, reloadKey]
	)

	// Live incoming invites: the initial load fires once per (auth, api), so mirror
	// useConversationUnread's WS pattern to surface a freshly received INVT without a
	// remount/reload. Low-frequency → no debounce; deduped by actionId.
	useWsBus({ cmds: ['ACTION'] }, function handleInvite(m) {
		const a = m.data as ActionView
		if (
			a.type !== 'INVT' ||
			a.subType === 'DEL' ||
			a.status !== 'C' ||
			a.audience?.idTag !== auth?.idTag
		)
			return
		setPendingInvites((prev) => {
			if (prev?.some((i) => i.actionId === a.actionId)) return prev
			return [a, ...(prev ?? [])]
		})
	})

	const acceptInvite = React.useCallback(
		async function acceptInvite(invite: ActionView): Promise<string | undefined> {
			if (!api || !auth) return undefined
			await api.actions.accept(invite.actionId)
			setPendingInvites((prev) => prev?.filter((i) => i.actionId !== invite.actionId))
			return invite.subject
		},
		[api, auth]
	)

	const rejectInvite = React.useCallback(
		async function rejectInvite(invite: ActionView): Promise<void> {
			if (!api) return
			await api.actions.reject(invite.actionId)
			setPendingInvites((prev) => prev?.filter((i) => i.actionId !== invite.actionId))
		},
		[api]
	)

	const reload = React.useCallback(() => setReloadKey((k) => k + 1), [])

	return { pendingInvites, error, reload, acceptInvite, rejectInvite }
}

// vim: ts=4
