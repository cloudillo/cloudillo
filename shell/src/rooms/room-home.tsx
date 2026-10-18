// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry } from '@cloudillo/core'
import {
	Badge,
	Button,
	EmptyState,
	Fcd,
	HBox,
	LoadingSpinner,
	makeChannel,
	Tab,
	Tabs,
	Text,
	useApi,
	useAuth,
	useDialog,
	useToast
} from '@cloudillo/react'
import type { NewAction } from '@cloudillo/types'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { activeContextAtom } from '../context/index.js'
import { IcMute, IcRoom, IcUnmute } from '../icons.js'
import { useMutedRooms } from '../lib/room-mute.js'
import { floorText } from '../profile/role-labels.js'
import { type RoomTab, roomsPath } from '../routes.js'
import { describeRoom } from '../settings/room-form.js'
import { useRoomsClient, useRoomsOutlet, useRoomsTenant } from './layout.js'
import { RoomMembers } from './room-members.js'
import { RoomSettingsTab } from './room-settings.js'

/**
 * Join / leave / mute for the rooms of `idTag`: the controls for one porch entry, shared by
 * `RoomsDirectory`'s rows and the room home.
 */
export function useRoomActions(
	idTag: string | undefined,
	rooms: PorchEntry[] | undefined,
	reload: () => void
): (room: PorchEntry) => React.ReactNode {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const toast = useToast()
	const me = auth?.idTag
	const { muted, mute, unmute } = useMutedRooms()
	// Subjects of my live outgoing SUBS: "Requested" on a closed door, "joined by knock" once in
	const [knocked, setKnocked] = React.useState<Set<string>>(new Set())
	const [knockedOf, setKnockedOf] = React.useState(idTag)
	if (knockedOf !== idTag) {
		setKnockedOf(idTag)
		setKnocked(new Set())
	}
	const [activeContext] = useAtom(activeContextAtom)
	// Wearing a partner hat here: closed rooms admit members only, so no knocking
	const hatted = activeContext?.idTag === idTag && !!activeContext?.hat
	const channelOf = (name: string) => makeChannel(idTag ?? '', name)
	const subjectsKey = rooms?.map((r) => r.name).join(',')

	React.useEffect(
		function loadMyKnocks() {
			if (!api || !me || !idTag || !subjectsKey) return
			let cancelled = false
			api.actions
				.list({
					type: 'SUBS',
					issuer: me,
					subject: subjectsKey.split(',').map((name) => makeChannel(idTag, name))
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
		if (!api || !idTag) return
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
		if (!api || !idTag) return
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

	return function membershipActions(room: PorchEntry) {
		const channel = channelOf(room.name)
		if (room.status === 'in') {
			const isMuted = muted.has(channel)
			// Members see no `closed` flag; a knock of mine that let me in means a closed room too
			const canLeave = !!me && me !== idTag && (room.closed || knocked.has(channel))
			return (
				<>
					{me && (
						<Button
							size="sm"
							variant="ghost"
							pressed={isMuted}
							icon={isMuted ? <IcMute /> : <IcUnmute />}
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
				</>
			)
		}
		if (room.status === 'invitation-only') {
			// plain /login like RequireAuth; no return URL until login supports one
			if (!me) {
				return (
					<Button size="sm" href="/login">
						{t('Sign in to join')}
					</Button>
				)
			}
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
}

/** `/<ctx>/rooms/:name/:tab?`: one room's summary, membership controls, and its members. */
export function RoomHome() {
	const { t } = useTranslation()
	const { name = '', tab } = useParams()
	const { idTag, base, rooms, error, reload } = useRoomsOutlet()
	const membershipActions = useRoomActions(idTag, rooms, reload)
	const client = useRoomsClient()
	const tenant = useRoomsTenant()
	// `useRoomsClient` follows the active context; it administers this page only for that tenant
	const adminClient = idTag && tenant === idTag ? client : null

	if (!rooms && error) {
		return (
			<Fcd.Content width="wide">
				<EmptyState
					icon={<IcRoom />}
					title={t('Could not load rooms')}
					actions={<Button onClick={reload}>{t('Retry')}</Button>}
				/>
			</Fcd.Content>
		)
	}
	if (!rooms) {
		return (
			<Fcd.Content width="wide">
				<LoadingSpinner />
			</Fcd.Content>
		)
	}
	const room = rooms.find((r) => r.name === name)
	if (!idTag || !room) {
		return (
			<Fcd.Content width="wide">
				<EmptyState
					icon={<IcRoom />}
					title={t('Room not found')}
					actions={<Button href={roomsPath(base)}>{t('All rooms')}</Button>}
				/>
			</Fcd.Content>
		)
	}

	const tabs: [RoomTab, string][] = [
		[
			'members',
			room.memberCount !== undefined
				? t('Members · {{count}}', { count: room.memberCount })
				: t('Members')
		]
	]
	if (adminClient) tabs.push(['settings', t('Settings')])
	// Unknown or retired tabs (`overview`) land on the default, the member list
	const current: RoomTab = tab === 'settings' && adminClient ? 'settings' : 'members'
	const inRoom = room.status === 'in'

	return (
		<Fcd.Content width="wide">
			<Text as="p" color="secondary" className="mb-1">
				{
					// `visibility` reaches admins only; without it describeRoom would guess
					room.visibility !== undefined
						? `~${room.name} · ${describeRoom(room, t)}`
						: `~${room.name}`
				}
			</Text>
			{room.descr && (
				<Text as="p" className="mb-2">
					{room.descr}
				</Text>
			)}
			<HBox gap={1} className="mb-3">
				{inRoom && <Badge variant="soft">{t('Member')}</Badge>}
				{membershipActions(room)}
			</HBox>
			{tabs.length > 1 && (
				<Tabs className="mb-3">
					{tabs.map(([id, label]) => (
						<Tab key={id} href={roomsPath(base, room.name, id)} active={id === current}>
							{label}
						</Tab>
					))}
				</Tabs>
			)}
			{current === 'settings' && adminClient ? (
				<RoomSettingsTab
					client={adminClient}
					tenant={idTag}
					room={room}
					base={base}
					onChanged={reload}
				/>
			) : (
				<RoomMembers
					room={room}
					client={adminClient}
					tenant={idTag}
					channel={makeChannel(idTag, room.name)}
				/>
			)}
		</Fcd.Content>
	)
}

// vim: ts=4
