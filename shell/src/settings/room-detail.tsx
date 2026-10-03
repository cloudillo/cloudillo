// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient, PorchEntry } from '@cloudillo/core'
import {
	ActionBar,
	Badge,
	Button,
	Dialog,
	EmptyState,
	List,
	ListItem,
	LoadingSpinner,
	makeChannel,
	Panel,
	ProfileMultiSelect,
	ProfilePicture,
	Text,
	TimeFormat,
	useDialog,
	useToast,
	VBox
} from '@cloudillo/react'
import {
	type ActionView,
	type CommunityRole,
	type Profile,
	ROLE_LEVELS,
	roleLevel
} from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuDoorOpen as IcRoom, LuUserPlus as IcInvite } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'

import { useCtx } from '../context/index.js'
import { settingsPath } from '../routes.js'
import { RoomForm } from './room-form.js'
import { useRooms, useRoomsClient, useRoomsTenant } from './rooms.js'

/** Whether a tenant member's role lets them into the room; a follower or connection is at least a follower. */
function clearsFloor(profile: Profile, minRole: string | null | undefined): boolean {
	const floor = profile.follower || profile.connected === true ? ROLE_LEVELS.follower : 0
	return (
		!minRole || roleLevel(profile.roles, floor) >= (ROLE_LEVELS[minRole as CommunityRole] ?? 0)
	)
}

/** Roster of a closed room: pending knocks, members, outstanding invitations. */
function useRoster(client: ApiClient, channel: string, name: string) {
	const toast = useToast()
	const { t } = useTranslation()
	const [requests, setRequests] = React.useState<ActionView[]>()
	const [members, setMembers] = React.useState<string[]>()
	const [invited, setInvited] = React.useState<ActionView[]>()
	const [profiles, setProfiles] = React.useState<Profile[]>([])
	const [version, setVersion] = React.useState(0)

	React.useEffect(
		function loadRoster() {
			let cancelled = false
			;(async function () {
				try {
					const [knocks, roster, invites, people] = await Promise.all([
						client.actions.list({ type: 'SUBS', subject: channel, status: 'C' }),
						client.channels.members(name),
						// As in community invitations: the host copy rests at 'A', so acceptance shows up
						// as membership, filtered out below.
						client.actions.list({
							type: 'INVT',
							subject: channel,
							status: ['C', 'P', 'A']
						}),
						client.profiles.list({ type: 'person' })
					])
					if (cancelled) return
					const memberSet = new Set(roster)
					setRequests(knocks as ActionView[])
					setMembers(roster)
					setInvited(
						(invites as ActionView[]).filter(
							(a) => !(a.audience?.idTag && memberSet.has(a.audience.idTag))
						)
					)
					setProfiles(people as Profile[])
				} catch (err) {
					console.error('Failed to load room roster:', err)
					if (!cancelled) toast.error(t('Failed to load room members'))
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[client, channel, name, version, toast, t]
	)

	return { requests, members, invited, profiles, reload: () => setVersion((v) => v + 1) }
}

interface InviteToRoomDialogProps {
	open: boolean
	onClose: () => void
	client: ApiClient
	channel: string
	room: PorchEntry
	/** Tenant members who may be invited (already clear the floor, not yet in) */
	candidates: Profile[]
	onSent: () => void
}

function InviteToRoomDialog({
	open,
	onClose,
	client,
	channel,
	room,
	candidates,
	onSent
}: InviteToRoomDialogProps) {
	const { t } = useTranslation()
	const toast = useToast()
	const [selected, setSelected] = React.useState<Profile[]>([])
	const [submitting, setSubmitting] = React.useState(false)

	React.useEffect(() => {
		if (!open) setSelected([])
	}, [open])

	async function listProfiles(q: string): Promise<Profile[]> {
		const needle = q.toLowerCase()
		return candidates.filter(
			(p) =>
				p.idTag.toLowerCase().includes(needle) || !!p.name?.toLowerCase().includes(needle)
		)
	}

	async function handleSubmit() {
		setSubmitting(true)
		let failed = 0
		for (const invitee of selected) {
			try {
				await client.actions.create({
					type: 'INVT',
					audienceTag: invitee.idTag,
					subject: channel,
					content: { groupName: room.title || `~${room.name}` }
				})
			} catch (err) {
				console.error('Failed to invite', invitee.idTag, err)
				failed++
			}
		}
		setSubmitting(false)
		onSent()
		if (failed) toast.error(t('Failed to send invitation'))
		else {
			toast.success(t('{{count}} invitations sent', { count: selected.length }))
			onClose()
		}
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			size="sm"
			title={t('Invite to room')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						disabled={selected.length === 0 || submitting}
						onClick={handleSubmit}
					>
						{t('Send invite')}
					</Button>
				</ActionBar>
			}
		>
			<ProfileMultiSelect
				emptyText={t('Search members who can enter this room')}
				listProfiles={listProfiles}
				value={selected}
				onAdd={(p) => setSelected((prev) => [...prev, p])}
				onRemove={(p) => setSelected((prev) => prev.filter((m) => m.idTag !== p.idTag))}
			/>
		</Dialog>
	)
}

interface RoomRosterProps {
	client: ApiClient
	room: PorchEntry
	channel: string
}

function RoomRoster({ client, room, channel }: RoomRosterProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()
	const { requests, members, invited, profiles, reload } = useRoster(client, channel, room.name)
	const [inviting, setInviting] = React.useState(false)
	const [busy, setBusy] = React.useState<string>()

	const byTag = React.useMemo(() => new Map(profiles.map((p) => [p.idTag, p])), [profiles])
	const candidates = React.useMemo(() => {
		const taken = new Set([
			...(members ?? []),
			...(invited ?? []).map((a) => a.audience?.idTag)
		])
		return profiles.filter((p) => !taken.has(p.idTag) && clearsFloor(p, room.minRole))
	}, [profiles, members, invited, room.minRole])

	async function run(key: string, fn: () => Promise<unknown>, failMsg: string) {
		setBusy(key)
		try {
			await fn()
			reload()
		} catch (err) {
			console.error('[RoomDetail]', err)
			toast.error(failMsg)
		} finally {
			setBusy(undefined)
		}
	}

	// Removing a member and cancelling an invitation are both an INVT DEL for that person.
	// ponytail: whether INVT DEL also evicts a knock-joined member is backend answer V2 (unanswered)
	function uninvite(idTag: string) {
		return client.actions.create({
			type: 'INVT',
			subType: 'DEL',
			subject: channel,
			audienceTag: idTag
		})
	}

	async function handleRemove(idTag: string) {
		const confirmed = await dialog.confirm(
			t('Remove from room'),
			t('{{name}} will no longer be able to enter this room.', {
				name: byTag.get(idTag)?.name || idTag
			}),
			{ color: 'error', confirmLabel: t('Remove') }
		)
		if (confirmed) run(idTag, () => uninvite(idTag), t('Failed to remove member'))
	}

	if (!requests || !members || !invited) return <LoadingSpinner />

	return (
		<>
			<Panel
				padding={3}
				headingLevel={4}
				title={
					<>
						{t('Requests')}{' '}
						{requests.length > 0 && <Badge variant="soft">{requests.length}</Badge>}
					</>
				}
			>
				{requests.length === 0 ? (
					<EmptyState size="sm" title={t('No pending requests')} />
				) : (
					<List variant="divided">
						{requests.map((a) => (
							<ListItem
								key={a.actionId}
								leading={a.issuer && <ProfilePicture profile={a.issuer} />}
								title={a.issuer?.name || a.issuer?.idTag}
								meta={<TimeFormat time={a.createdAt} />}
								trailing={
									<>
										<Button
											variant="ghost"
											color="success"
											disabled={busy === a.actionId}
											onClick={() =>
												run(
													a.actionId,
													() => client.actions.accept(a.actionId),
													t('Failed to accept request')
												)
											}
										>
											{t('Accept')}
										</Button>
										<Button
											variant="ghost"
											color="error"
											disabled={busy === a.actionId}
											onClick={() =>
												run(
													a.actionId,
													() => client.actions.reject(a.actionId),
													t('Failed to decline request')
												)
											}
										>
											{t('Decline')}
										</Button>
									</>
								}
							/>
						))}
					</List>
				)}
			</Panel>

			<Panel
				padding={3}
				headingLevel={4}
				title={t('Members')}
				actions={
					<Button icon={<IcInvite />} onClick={() => setInviting(true)}>
						{t('Invite')}
					</Button>
				}
			>
				{members.length === 0 ? (
					<EmptyState size="sm" title={t('No members yet')} />
				) : (
					<List variant="divided">
						{members.map((idTag) => {
							const p = byTag.get(idTag)
							return (
								<ListItem
									key={idTag}
									leading={<ProfilePicture profile={p ?? { idTag }} />}
									title={p?.name || idTag}
									subtitle={p?.name ? idTag : undefined}
									trailing={
										<Button
											variant="ghost"
											color="error"
											disabled={busy === idTag}
											onClick={() => handleRemove(idTag)}
										>
											{t('Remove')}
										</Button>
									}
								/>
							)
						})}
					</List>
				)}
			</Panel>

			{invited.length > 0 && (
				<Panel padding={3} headingLevel={4} title={t('Invited')}>
					<List variant="divided">
						{invited.map((a) => {
							const invitee = a.audience
							const idTag = invitee?.idTag
							return (
								<ListItem
									key={a.actionId}
									leading={invitee && <ProfilePicture profile={invitee} />}
									title={invitee ? invitee.name || invitee.idTag : t('(unknown)')}
									meta={<TimeFormat time={a.createdAt} />}
									trailing={
										idTag && (
											<Button
												variant="ghost"
												color="error"
												disabled={busy === idTag}
												onClick={() =>
													run(
														idTag,
														() => uninvite(idTag),
														t('Failed to revoke invitation')
													)
												}
											>
												{t('Cancel')}
											</Button>
										)
									}
								/>
							)
						})}
					</List>
				</Panel>
			)}

			<InviteToRoomDialog
				open={inviting}
				onClose={() => setInviting(false)}
				client={client}
				channel={channel}
				room={room}
				candidates={candidates}
				onSent={reload}
			/>
		</>
	)
}

/** `settings/rooms/:name`: edit a room, manage a closed room's roster, delete it. */
export function RoomDetailSettings() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const dialog = useDialog()
	const toast = useToast()
	const { name } = useParams()
	const listPath = settingsPath(useCtx().base, 'rooms')
	const client = useRoomsClient()
	const tenant = useRoomsTenant()
	const { rooms } = useRooms(client, tenant)
	const room = rooms?.find((r) => r.name === name)

	if (!client || !tenant) return null
	if (!rooms) return <LoadingSpinner />
	if (!room) {
		return <EmptyState icon={<IcRoom />} title={t('Room not found')} />
	}
	const channel = makeChannel(tenant, room.name)

	async function handleDelete() {
		if (!client || !room) return
		const confirmed = await dialog.confirm(
			t('Delete room'),
			t('Content stays but becomes readable only by {{tenant}}.', { tenant }),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (!confirmed) return
		try {
			await client.channels.delete(room.name)
			navigate(listPath)
		} catch (err) {
			console.error('Failed to delete room:', err)
			toast.error(t('Failed to delete room'))
		}
	}

	return (
		<VBox gap={3}>
			<Panel padding={3} title={room.title || `~${room.name}`} headingLevel={4}>
				<RoomForm
					key={room.name}
					client={client}
					room={room}
					onCancel={() => navigate(listPath)}
					onSaved={() => {
						toast.success(t('Room saved'))
						navigate(listPath)
					}}
				/>
			</Panel>

			{room.closed && <RoomRoster client={client} room={room} channel={channel} />}

			<Panel padding={3} title={t('Danger zone')} headingLevel={4}>
				<Text as="p" emphasis="muted" className="mb-2">
					{t('Content stays but becomes readable only by {{tenant}}.', { tenant })}
				</Text>
				<Button color="error" onClick={handleDelete}>
					{t('Delete room')}
				</Button>
			</Panel>
		</VBox>
	)
}

// vim: ts=4
