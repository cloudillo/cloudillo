// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient, PorchEntry } from '@cloudillo/core'
import {
	Badge,
	Button,
	Dialog,
	EmptyState,
	List,
	ListItem,
	LoadingSpinner,
	makeChannel,
	Panel,
	parseChannel,
	Text,
	useApi,
	useAuth,
	useToast
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuDoorOpen as IcRoom, LuPlus as IcAdd } from 'react-icons/lu'

import { canAdminContext, useActiveCommunity, useApiContext, useCtx } from '../context/index.js'
import { settingsPath } from '../routes.js'
import { describeRoom, RoomForm } from './room-form.js'

/**
 * The API client of the tenant whose rooms are administered: the active community's (through
 * its context token), or the home client for a person's own rooms. Null while no token exists,
 * or when the user may not administer the community's rooms.
 */
export function useRoomsClient(): ApiClient | null {
	const { api } = useApi()
	const [auth] = useAuth()
	const community = useActiveCommunity()
	const { getClientFor } = useApiContext()
	const communityIdTag = community?.idTag
	const allowed = !community || canAdminContext(community, auth?.idTag, 'rooms')

	return React.useMemo(() => {
		if (!allowed) return null
		if (!communityIdTag) return api ?? null
		return getClientFor(communityIdTag, { explicit: true })
	}, [allowed, communityIdTag, api, getClientFor])
}

/** The idTag of the tenant whose rooms are administered: the active community, or the user. */
export function useRoomsTenant(): string | undefined {
	const [auth] = useAuth()
	return useActiveCommunity()?.idTag ?? auth?.idTag
}

/**
 * The tenant's rooms with their admin fields, closed-room member counts and pending knock
 * counts; reloaded by calling `reload`.
 */
export function useRooms(client: ApiClient | null, tenant: string | undefined) {
	const [rooms, setRooms] = React.useState<PorchEntry[]>()
	const [memberCounts, setMemberCounts] = React.useState<Record<string, number>>({})
	const [requestCounts, setRequestCounts] = React.useState<Record<string, number>>({})
	const [version, setVersion] = React.useState(0)
	// Another tenant: drop the previous one's data during render, like `usePorch`.
	const [prevTenant, setPrevTenant] = React.useState(tenant)
	if (prevTenant !== tenant) {
		setPrevTenant(tenant)
		setRooms(undefined)
		setMemberCounts({})
		setRequestCounts({})
	}

	React.useEffect(
		function loadRooms() {
			if (!client || !tenant) return
			let cancelled = false
			;(async function () {
				try {
					const list = await client.channels.list()
					if (cancelled) return
					setRooms(list)
					const closed = list.filter((r) => r.closed)
					if (closed.length === 0) {
						setMemberCounts({})
						setRequestCounts({})
						return
					}
					// ponytail: one roster request per closed room; a count field on the list if rooms grow many
					const [counts, knocks] = await Promise.all([
						Promise.all(
							closed.map(async (r) => [
								r.name,
								(await client.channels.members(r.name)).length
							])
						),
						client.actions.list({
							type: 'SUBS',
							status: 'C',
							subject: closed.map((r) => makeChannel(tenant, r.name))
						})
					])
					if (cancelled) return
					setMemberCounts(Object.fromEntries(counts))
					const pending: Record<string, number> = {}
					for (const k of knocks) {
						const name = k.subject && parseChannel(k.subject).name
						if (name) pending[name] = (pending[name] ?? 0) + 1
					}
					setRequestCounts(pending)
				} catch (err) {
					console.error('Failed to load rooms:', err)
					if (!cancelled) setRooms((prev) => prev ?? [])
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[client, tenant, version]
	)

	return { rooms, memberCounts, requestCounts, reload: () => setVersion((v) => v + 1) }
}

/** `settings/rooms`: the tenant's rooms, with "New room". */
export function RoomsSettings() {
	const { t } = useTranslation()
	const toast = useToast()
	const base = useCtx().base
	const client = useRoomsClient()
	const { rooms, memberCounts, requestCounts, reload } = useRooms(client, useRoomsTenant())
	const [creating, setCreating] = React.useState(false)

	if (!client) {
		return (
			<Panel padding={3}>
				<Text as="p" emphasis="muted">
					{t('You need moderator permissions to manage rooms.')}
				</Text>
			</Panel>
		)
	}

	return (
		<Panel padding={3}>
			<Button
				color="primary"
				className="mb-2"
				icon={<IcAdd />}
				onClick={() => setCreating(true)}
			>
				{t('New room')}
			</Button>

			{!rooms ? (
				<LoadingSpinner />
			) : rooms.length === 0 ? (
				<EmptyState
					icon={<IcRoom />}
					title={t('No rooms yet')}
					description={t('Rooms group posts and files for a subset of people.')}
				/>
			) : (
				<List>
					{rooms.map((room) => (
						<ListItem
							key={room.name}
							leading={<IcRoom />}
							title={room.title || `~${room.name}`}
							subtitle={`~${room.name} · ${describeRoom(room, t)}`}
							meta={
								room.closed && memberCounts[room.name] !== undefined
									? t('{{count}} members', { count: memberCounts[room.name] })
									: undefined
							}
							trailing={
								requestCounts[room.name] ? (
									<Badge variant="soft">{requestCounts[room.name]}</Badge>
								) : undefined
							}
							href={settingsPath(base, ['rooms', room.name])}
						/>
					))}
				</List>
			)}

			<Dialog
				open={creating}
				onClose={() => setCreating(false)}
				size="sm"
				title={t('New room')}
			>
				{creating && (
					<RoomForm
						client={client}
						onCancel={() => setCreating(false)}
						onSaved={() => {
							setCreating(false)
							reload()
							toast.success(t('Room created'))
						}}
					/>
				)}
			</Dialog>
		</Panel>
	)
}

// vim: ts=4
