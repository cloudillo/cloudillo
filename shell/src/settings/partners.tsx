// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Community admin → Partner communities (leaders only): incoming community CONN requests,
 * the connected type=C peers with both hat role maps, "Connect a community" and a per-peer
 * map editor. Everything runs through the active community's context token.
 */

import type { ApiClient } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Dialog,
	EmptyState,
	Field,
	Heading,
	List,
	ListItem,
	LoadingSpinner,
	Panel,
	ProfilePicture,
	ProfileSelect,
	Segmented,
	SegmentedItem,
	Text,
	useApi,
	useAuth,
	useDialog,
	useToast,
	VBox
} from '@cloudillo/react'
import type { ActionView, CommunityRole, Profile } from '@cloudillo/types'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPlus as IcAdd, LuHandshake as IcPartner } from 'react-icons/lu'

import { canAdminContext, useActiveCommunity, useApiContext } from '../context/index.js'
import { PendingRequestsList } from '../profile/community-requests.js'
import { roleLabels } from '../profile/role-labels.js'
import {
	effectiveHatRoles,
	formatHatRoles,
	HAT_TARGET_ROLES,
	hatRoleRanges,
	parseHatRoles
} from './hat-roles.js'

function roleLabel(t: TFunction, role: string): string {
	return roleLabels(t)[role as CommunityRole] ?? role
}

function rolePlural(t: TFunction, role: string): string {
	switch (role) {
		case 'supporter':
			return t('Supporters')
		case 'contributor':
			return t('Contributors')
		case 'moderator':
			return t('Moderators')
		case 'leader':
			return t('Leaders')
		default:
			return role
	}
}

/** One sentence per `hatRoleRanges` run, e.g. "Supporters and above join here as Supporter." */
export function rangeSentences(t: TFunction, map: Record<string, string>): string[] {
	return hatRoleRanges(map).map(({ lo, hi, local }) => {
		const opts = { role: rolePlural(t, lo), hi: rolePlural(t, hi), local: roleLabel(t, local) }
		if (lo === hi) return t('{{role}} join here as {{local}}.', opts)
		if (hi === 'leader') return t('{{role}} and above join here as {{local}}.', opts)
		return t('{{role}} to {{hi}} join here as {{local}}.', opts)
	})
}

/** The range sentences joined with " · ", or "No access granted" for an absent or empty map. */
function describeMap(t: TFunction, s: string | null | undefined): string {
	return rangeSentences(t, parseHatRoles(s)).join(' · ') || t('No access granted')
}

const fromCommunity = (a: ActionView) => a.issuer.type === 'community'

/** Asks for a note, then sends `client`'s community a CONN to `target`. True once it is sent. */
export function useConnectCommunity() {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()
	return React.useCallback(
		async (client: ApiClient, target: { idTag: string; name?: string }): Promise<boolean> => {
			const name = target.name || target.idTag
			const content = await dialog.askText(
				t('Connect a community'),
				t('Send a partnership request to {{name}}?', { name }),
				{ placeholder: t('Personalize the connection request'), multiline: true }
			)
			if (content == undefined) return false
			try {
				await client.actions.create({ type: 'CONN', audienceTag: target.idTag, content })
				toast.success(t('Request sent'))
				return true
			} catch (err) {
				console.error('Failed to send partnership request', err)
				toast.error(t('Failed to send request'))
				return false
			}
		},
		[dialog, toast, t]
	)
}

export function PartnersSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const community = useActiveCommunity()
	const { getClientFor } = useApiContext()
	const connectCommunity = useConnectCommunity()
	const communityIdTag = community?.idTag
	const allowed = !!community && canAdminContext(community, auth?.idTag, 'partners')
	const client = React.useMemo(
		() => (allowed && communityIdTag ? getClientFor(communityIdTag, { explicit: true }) : null),
		[allowed, communityIdTag, getClientFor]
	)

	const [peers, setPeers] = React.useState<Profile[]>()
	const [peersOf, setPeersOf] = React.useState(communityIdTag)
	if (peersOf !== communityIdTag) {
		setPeersOf(communityIdTag)
		setPeers(undefined)
	}
	const [version, setVersion] = React.useState(0)
	const reload = React.useCallback(() => setVersion((v) => v + 1), [])
	const [editing, setEditing] = React.useState<Profile>()
	const [connecting, setConnecting] = React.useState(false)

	React.useEffect(
		function loadPeers() {
			if (!client) return
			let cancelled = false
			client.profiles
				.list({ type: 'community', connected: true })
				.then((list) => {
					if (!cancelled) setPeers(list.filter((p) => p.idTag !== communityIdTag))
				})
				.catch((err) => {
					console.error('Failed to load partner communities', err)
					if (!cancelled) setPeers([])
				})
			return () => {
				cancelled = true
			}
		},
		[client, communityIdTag, version]
	)

	// Discovery runs on the home node: the communities the user already knows.
	async function listCommunities(q: string): Promise<Profile[] | undefined> {
		if (!api || !q) return []
		const known = new Set(peers?.map((p) => p.idTag))
		const list = await api.profiles.list({ q, type: 'community' })
		return list?.filter((p) => p.idTag !== communityIdTag && !known.has(p.idTag))
	}

	async function connect(target: Profile) {
		if (client && (await connectCommunity(client, target))) setConnecting(false)
	}

	if (!client || !community) {
		return (
			<Panel padding={3}>
				<Text as="p" emphasis="muted">
					{t('Only leaders can manage partner communities.')}
				</Text>
			</Panel>
		)
	}

	return (
		<Panel padding={3}>
			<Heading level={3} className="mb-1">
				{t('Requests')}
			</Heading>
			<PendingRequestsList
				communityIdTag={community.idTag}
				getClientFor={getClientFor}
				onChange={reload}
				filter={fromCommunity}
			/>

			<Heading level={3} className="mt-3 mb-1">
				{t('Partner communities')}
			</Heading>
			<Button className="mb-2" icon={<IcAdd />} onClick={() => setConnecting(true)}>
				{t('Connect a community')}
			</Button>
			{!peers ? (
				<LoadingSpinner />
			) : peers.length === 0 ? (
				<EmptyState
					icon={<IcPartner />}
					title={t('No partner communities yet')}
					description={t("Partners' members can act here with the role you grant them.")}
				/>
			) : (
				<List variant="divided" aria-label={t('Partner communities')}>
					{peers.map((p) => (
						<ListItem
							key={p.idTag}
							leading={<ProfilePicture profile={p} srcTag={p.idTag} />}
							title={p.name || p.idTag}
							subtitle={
								<>
									<Text as="div">
										{t('Their members here: {{roles}}', {
											roles: describeMap(t, p.hatRoles)
										})}
									</Text>
									<Text as="div">
										{t('Our members there: {{roles}}', {
											roles: describeMap(t, p.peerHatRoles)
										})}
									</Text>
								</>
							}
							onClick={() => setEditing(p)}
						/>
					))}
				</List>
			)}

			<Dialog
				open={connecting}
				onClose={() => setConnecting(false)}
				size="sm"
				title={t('Connect a community')}
			>
				{connecting && (
					<ProfileSelect
						placeholder={t('Search communities...')}
						listProfiles={listCommunities}
						onChange={(p) => p && connect(p)}
					/>
				)}
			</Dialog>

			<Dialog
				open={!!editing}
				onClose={() => setEditing(undefined)}
				size="md"
				title={editing && (editing.name || editing.idTag)}
			>
				{editing && (
					<HatRolesEditor
						key={editing.idTag}
						peer={editing}
						onDone={() => {
							setEditing(undefined)
							reload()
						}}
					/>
				)}
			</Dialog>
		</Panel>
	)
}

function HatRolesEditor({ peer, onDone }: { peer: Profile; onDone: () => void }) {
	const { t } = useTranslation()
	const community = useActiveCommunity()
	const { getClientFor } = useApiContext()
	const dialog = useDialog()
	const toast = useToast()
	const [map, setMap] = React.useState(() => parseHatRoles(peer.hatRoles))
	const [busy, setBusy] = React.useState(false)
	const name = peer.name || peer.idTag
	const changed = formatHatRoles(map) !== formatHatRoles(parseHatRoles(peer.hatRoles))
	const summary = rangeSentences(t, map)

	async function run(fn: (client: ApiClient) => Promise<unknown>) {
		const client = community && getClientFor(community.idTag, { explicit: true })
		if (!client) return
		setBusy(true)
		try {
			await fn(client)
			toast.success(t('Saved'))
			onDone()
		} catch (err) {
			console.error('Failed to update partner community', err)
			toast.error(t('Failed to save'))
		} finally {
			setBusy(false)
		}
	}

	async function revoke() {
		const ok = await dialog.confirm(
			t('Revoke all access'),
			t("{{name}}'s members will no longer be able to act here.", { name }),
			{ color: 'error', confirmLabel: t('Revoke') }
		)
		if (ok) run((c) => c.profiles.adminUpdate(peer.idTag, { hatRoles: null }))
	}

	async function disconnect() {
		const ok = await dialog.confirm(
			t('Disconnect'),
			t('Disconnect from {{name}}? Hats between the two communities stop working.', {
				name
			}),
			{ color: 'error', confirmLabel: t('Disconnect') }
		)
		if (ok) {
			run((c) => c.actions.create({ type: 'CONN', subType: 'DEL', audienceTag: peer.idTag }))
		}
	}

	return (
		<VBox gap={2}>
			<Heading level={4}>{t("Their members' access here")}</Heading>
			<Text as="p" emphasis="muted">
				{t(
					'Members of {{name}} can act in this community with a role you choose. Their role there decides which role they get here.',
					{ name }
				)}
			</Text>
			<Alert color="info" compact>
				{summary.length ? summary.join(' ') : t('No access yet: set a role below.')}
			</Alert>
			{/* Highest first, so an unset row reads "same as" a row below it */}
			{effectiveHatRoles(map)
				.reverse()
				.map(({ peer: peerRole, local, from }) => (
					<Field
						key={peerRole}
						label={roleLabel(t, peerRole)}
						hint={
							!map[peerRole] &&
							(local && from
								? t('Gets {{role}}, same as {{from}}', {
										role: roleLabel(t, local),
										from: roleLabel(t, from)
									})
								: t('No access'))
						}
					>
						<Segmented
							size="sm"
							layout="grid"
							style={{ '--segmented-min': '6rem' } as React.CSSProperties}
							aria-label={t('Role here for {{role}}', {
								role: roleLabel(t, peerRole)
							})}
							value={map[peerRole] ?? ''}
							onChange={(v) => setMap({ ...map, [peerRole]: v })}
						>
							<SegmentedItem value="">{t('Not set')}</SegmentedItem>
							{HAT_TARGET_ROLES.map((role) => (
								<SegmentedItem key={role} value={role}>
									{roleLabel(t, role)}
								</SegmentedItem>
							))}
						</Segmented>
					</Field>
				))}
			<Text as="p" size="sm" emphasis="muted">
				{t("Followers can't act with a hat.")}
			</Text>
			<ActionBar>
				<Button disabled={busy} onClick={disconnect}>
					{t('Disconnect')}
				</Button>
				<Button
					disabled={busy}
					disabledReason={
						peer.hatRoles == null ? t('No access has been granted yet') : undefined
					}
					onClick={revoke}
				>
					{t('Revoke all access')}
				</Button>
				<Button
					color="primary"
					disabled={busy || !changed}
					onClick={() =>
						run((c) =>
							c.profiles.adminUpdate(peer.idTag, { hatRoles: formatHatRoles(map) })
						)
					}
				>
					{t('Save')}
				</Button>
			</ActionBar>
		</VBox>
	)
}

// vim: ts=4
