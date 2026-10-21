// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

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
	Panel,
	PersonHover,
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

import { useApiContext } from '../context/index.js'
import { IcInvite } from '../icons.js'
import { floorText } from '../profile/role-labels.js'

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

/** A closed room's roster for its admins: accept/decline knocks, invite, remove, revoke. */
export function RoomRoster({ client, room, channel }: RoomRosterProps) {
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
			console.error('[RoomMembers]', err)
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
		<VBox gap={3}>
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
								leading={
									a.issuer && (
										<PersonHover idTag={a.issuer.idTag}>
											<ProfilePicture profile={a.issuer} />
										</PersonHover>
									)
								}
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
									leading={
										<PersonHover idTag={idTag}>
											<ProfilePicture profile={p ?? { idTag }} />
										</PersonHover>
									}
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
									leading={
										invitee && (
											<PersonHover idTag={invitee.idTag}>
												<ProfilePicture profile={invitee} />
											</PersonHover>
										)
									}
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
		</VBox>
	)
}

/** Read-only roster of a closed room, for its members (the backend lets room members list it). */
function RoomMemberList({ tenant, name }: { tenant: string; name: string }) {
	const { t } = useTranslation()
	const { getClientFor } = useApiContext()
	// null: the load failed
	const [members, setMembers] = React.useState<string[] | null>()

	React.useEffect(
		function loadMembers() {
			const client = getClientFor(tenant, { auth: 'preferred' })
			if (!client) return
			let cancelled = false
			client.channels
				.members(name)
				.then((list) => {
					if (!cancelled) setMembers(list)
				})
				.catch((err) => {
					console.error('Failed to load room members:', err)
					if (!cancelled) setMembers(null)
				})
			return () => {
				cancelled = true
			}
		},
		[tenant, name, getClientFor]
	)

	if (members === null) return <EmptyState size="sm" title={t('Failed to load room members')} />
	if (!members) return <LoadingSpinner />
	if (members.length === 0) return <EmptyState size="sm" title={t('No members yet')} />
	return (
		<List variant="divided">
			{members.map((idTag) => (
				<ListItem
					key={idTag}
					leading={
						<PersonHover idTag={idTag}>
							<ProfilePicture profile={{ idTag }} />
						</PersonHover>
					}
					title={idTag}
				/>
			))}
		</List>
	)
}

interface RoomMembersProps {
	room: PorchEntry
	/** The room tenant's admin client (`useRoomsClient`), null when the viewer is no room admin */
	client: ApiClient | null
	/** The room's tenant idTag */
	tenant: string
	/** `@tenant~name` */
	channel: string
}

/** The room home's Members tab. */
export function RoomMembers({ room, client, tenant, channel }: RoomMembersProps) {
	const { t } = useTranslation()

	// Members see `closed`; a visitor at a closed door only sees `invitation-only`
	if (room.closed || room.status === 'invitation-only') {
		if (client && room.closed)
			return <RoomRoster client={client} room={room} channel={channel} />
		if (room.closed && room.status === 'in') {
			return <RoomMemberList tenant={tenant} name={room.name} />
		}
		return (
			<Text as="p" emphasis="muted">
				{t('Only room members can see the member list.')}
			</Text>
		)
	}
	return <Text as="p">{room.minRole ? floorText(t, room.minRole) : t('Anyone can enter')}</Text>
}

// vim: ts=4
