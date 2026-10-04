// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry } from '@cloudillo/core'
import {
	Button,
	EmptyState,
	HBox,
	List,
	ListItem,
	LoadingSpinner,
	makeChannel,
	Panel,
	Text,
	useApi,
	useAuth,
	useDialog,
	useToast
} from '@cloudillo/react'
import { type NewAction, ROLE_LEVELS, roleLevel } from '@cloudillo/types'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuBellOff as IcMuted,
	LuBell as IcUnmuted,
	LuDoorOpen as IcRoom,
	LuPlus as IcAdd
} from 'react-icons/lu'

import { activeContextAtom, canAdminContext } from '../context/index.js'
import { useMutedRooms } from '../lib/room-mute.js'
import { ctxBase, feedPath, filesPath, settingsPath } from '../routes.js'
import { floorText } from './role-labels.js'

/** Whether the viewer may create rooms on `idTag`: their own tenant, or a community they moderate. */
export function useCanCreateRooms(idTag: string | undefined, communityRoles?: string[]): boolean {
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	if (!auth?.idTag || !idTag) return false
	if (auth.idTag === idTag) return true
	if (activeContext?.idTag === idTag) return canAdminContext(activeContext, auth.idTag, 'rooms')
	return roleLevel(communityRoles) >= ROLE_LEVELS.moderator
}

interface RoomsTabProps {
	idTag: string
	rooms?: PorchEntry[]
	/** The porch failed to load (with no earlier list to show) */
	error?: boolean
	canCreate: boolean
	reload: () => void
}

/** Profile → Rooms: the tenant's porch, with open / mute / leave / ask-to-join per row. */
export function RoomsTab({ idTag, rooms, error, canCreate, reload }: RoomsTabProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const toast = useToast()
	const { muted, mute, unmute } = useMutedRooms()
	// Subjects of my live outgoing SUBS: "Requested" on a closed door, "joined by knock" once in
	const [knocked, setKnocked] = React.useState<Set<string>>(new Set())
	const [knockedOf, setKnockedOf] = React.useState(idTag)
	if (knockedOf !== idTag) {
		setKnockedOf(idTag)
		setKnocked(new Set())
	}
	const me = auth?.idTag
	const [activeContext] = useAtom(activeContextAtom)
	// Wearing a partner hat here: closed rooms admit members only, so no knocking
	const hatted = activeContext?.idTag === idTag && !!activeContext.hat
	const base = ctxBase(idTag, me)
	const channelOf = (name: string) => makeChannel(idTag, name)
	const subjectsKey = rooms?.map((r) => r.name).join(',')

	React.useEffect(
		function loadMyKnocks() {
			if (!api || !me || !subjectsKey) return
			let cancelled = false
			api.actions
				.list({
					type: 'SUBS',
					issuer: me,
					subject: subjectsKey.split(',').map(channelOf)
				})
				.then((list) => {
					if (cancelled) return
					setKnocked(
						new Set(
							list
								.filter((a) => !a.subType && a.status !== 'D' && a.subject)
								.map((a) => a.subject as string)
						)
					)
				})
				.catch((err) => console.error('Failed to load room requests:', err))
			return () => {
				cancelled = true
			}
		},
		[api, me, idTag, subjectsKey]
	)

	async function onKnock(room: PorchEntry) {
		if (!api) return
		const channel = channelOf(room.name)
		try {
			const action: NewAction = { type: 'SUBS', audienceTag: idTag, subject: channel }
			await api.actions.create(action)
			setKnocked((prev) => new Set(prev).add(channel))
		} catch (err) {
			console.error('Failed to send room request:', err)
			toast.error(t('Failed to send request'))
		}
	}

	async function onLeave(room: PorchEntry) {
		if (!api) return
		const title = room.title || `~${room.name}`
		if (
			!(await dialog.confirm(
				t('Leave room'),
				t('Leave {{room}}? You will need an invitation or approval to come back.', {
					room: title
				})
			))
		)
			return
		const channel = channelOf(room.name)
		try {
			const action: NewAction = {
				type: 'SUBS',
				subType: 'DEL',
				audienceTag: idTag,
				subject: channel
			}
			await api.actions.create(action)
			setKnocked((prev) => {
				const next = new Set(prev)
				next.delete(channel)
				return next
			})
			reload()
		} catch (err) {
			console.error('Failed to leave room:', err)
			toast.error(t('Failed to leave room'))
		}
	}

	async function onToggleMute(channel: string) {
		try {
			await (muted.has(channel) ? unmute(channel) : mute(channel))
		} catch (err) {
			console.error('Failed to change room mute:', err)
			toast.error(t('Failed to update setting'))
		}
	}

	function rowActions(room: PorchEntry) {
		const channel = channelOf(room.name)
		if (room.status === 'in') {
			const isMuted = muted.has(channel)
			// Members see no `closed` flag; a knock of mine that let me in means a closed room too
			const canLeave = !!me && me !== idTag && (room.closed || knocked.has(channel))
			return (
				<HBox gap={1}>
					<Button size="sm" href={feedPath(base, undefined, { room: room.name })}>
						{t('Open')}
					</Button>
					<Button size="sm" variant="ghost" href={filesPath(base, { drive: room.name })}>
						{t('Files')}
					</Button>
					{me && (
						<Button
							size="sm"
							variant="ghost"
							pressed={isMuted}
							icon={isMuted ? <IcMuted /> : <IcUnmuted />}
							onClick={() => onToggleMute(channel)}
						>
							{isMuted ? t('Unmute') : t('Mute')}
						</Button>
					)}
					{canLeave && (
						<Button size="sm" variant="ghost" onClick={() => onLeave(room)}>
							{t('Leave')}
						</Button>
					)}
				</HBox>
			)
		}
		if (room.status === 'invitation-only') {
			if (!me) return undefined
			if (hatted) {
				return (
					<Text size="sm" emphasis="muted">
						{t('Members only — not open to partner communities')}
					</Text>
				)
			}
			return knocked.has(channel) ? (
				<Button size="sm" disabled>
					{t('Requested')}
				</Button>
			) : (
				<Button size="sm" color="primary" onClick={() => onKnock(room)}>
					{t('Ask to join')}
				</Button>
			)
		}
		return (
			<Text size="sm" emphasis="muted">
				{floorText(t, room.status.slice('needs:'.length))}
			</Text>
		)
	}

	if (!rooms && error)
		return (
			<Panel padding={3}>
				<EmptyState
					icon={<IcRoom />}
					title={t('Could not load rooms')}
					actions={<Button onClick={reload}>{t('Retry')}</Button>}
				/>
			</Panel>
		)
	if (!rooms) return <LoadingSpinner />

	return (
		<Panel padding={3}>
			{rooms.length === 0 ? (
				<EmptyState
					icon={<IcRoom />}
					title={t('No rooms yet')}
					description={t('Rooms group posts and files for a subset of people.')}
					actions={
						canCreate && (
							<Button
								color="primary"
								icon={<IcAdd />}
								href={settingsPath(base, 'rooms')}
							>
								{t('Create a room')}
							</Button>
						)
					}
				/>
			) : (
				<List>
					{rooms.map((room) => (
						<ListItem
							key={room.name}
							leading={<IcRoom />}
							title={room.title || `~${room.name}`}
							subtitle={
								room.descr ? `~${room.name} · ${room.descr}` : `~${room.name}`
							}
							trailing={rowActions(room)}
						/>
					))}
				</List>
			)}
		</Panel>
	)
}

// vim: ts=4
