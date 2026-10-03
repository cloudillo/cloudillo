// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import { useApi } from '@cloudillo/react'
import { atom, useAtom } from 'jotai'
import * as React from 'react'

/** Muted rooms live on the reader's home node as `chan.mute.@tenant~name` = true. */
const PREFIX = 'chan.mute.'

/** Absolute channels (`@tenant~name`) the user muted; undefined until loaded. */
export const mutedRoomsAtom = atom<Set<string> | undefined>(undefined)

/** Writes made while the list loads; the list may predate them, so they are replayed on it. */
const pendingWrites = new Map<string, boolean>()

async function muteRoom(api: ApiClient, channel: string) {
	await api.settings.update(PREFIX + channel, { value: true }, { level: 'tenant' })
}

async function unmuteRoom(api: ApiClient, channel: string) {
	await api.settings.delete(PREFIX + channel, { level: 'tenant' })
}

/**
 * The user's muted rooms, shared across components, with mute/unmute that update it in place.
 * Empty for guests.
 */
export function useMutedRooms() {
	const { api } = useApi()
	const [muted, setMuted] = useAtom(mutedRoomsAtom)
	const loaded = muted !== undefined

	React.useEffect(
		function loadMutedRooms() {
			if (!api || loaded) return
			let cancelled = false
			api.settings
				.list({ prefix: 'chan.mute', level: 'tenant' })
				.then((rows) => {
					if (cancelled) return
					const next = new Set(
						rows
							.filter((r) => r.key.startsWith(PREFIX) && r.value)
							.map((r) => r.key.slice(PREFIX.length))
					)
					for (const [channel, on] of pendingWrites) {
						if (on) next.add(channel)
						else next.delete(channel)
					}
					pendingWrites.clear()
					setMuted(next)
				})
				.catch((err) => {
					console.error('Failed to load muted rooms:', err)
					if (cancelled) return
					// Settle on what this session wrote, or later writes park forever.
					setMuted(new Set([...pendingWrites].filter(([, on]) => on).map(([c]) => c)))
					pendingWrites.clear()
				})
			return () => {
				cancelled = true
			}
		},
		[api, loaded, setMuted]
	)

	const setOne = React.useCallback(
		async (channel: string, on: boolean) => {
			if (!api) return
			await (on ? muteRoom(api, channel) : unmuteRoom(api, channel))
			setMuted((prev) => {
				// Still loading: the in-flight list may predate this write
				if (!prev) {
					pendingWrites.set(channel, on)
					return prev
				}
				const next = new Set(prev)
				if (on) next.add(channel)
				else next.delete(channel)
				return next
			})
		},
		[api, setMuted]
	)

	return {
		muted: muted ?? new Set<string>(),
		mute: React.useCallback((channel: string) => setOne(channel, true), [setOne]),
		unmute: React.useCallback((channel: string) => setOne(channel, false), [setOne])
	}
}

// vim: ts=4
