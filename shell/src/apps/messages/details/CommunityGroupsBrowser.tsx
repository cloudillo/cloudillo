// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Button,
	EmptyState,
	List,
	ListItem,
	SkeletonList,
	Text,
	useApi,
	useAuth,
	useToast
} from '@cloudillo/react'
import { type ActionView, type CommunityRole, ROLE_LEVELS, roleLevel } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useContextRolesFor } from '../../../context/hooks.js'
import { IcGroup } from '../../../icons.js'

export interface CommunityGroupsBrowserProps {
	communityTag: string
	/** The viewer is in the group (joined now, or already a member): the host opens it. */
	onJoined: (convId: string) => void
}

interface GroupContent {
	name?: string
	description?: string
	join?: 'role' | 'request' | 'private'
	joinMinRole?: CommunityRole
}

/** Viewer is a community member (above follower): only they see community group chats. */
export function useIsCommunityMember(communityTag: string | undefined): boolean {
	const roles = useContextRolesFor(communityTag)
	return !!communityTag && roleLevel(roles) > ROLE_LEVELS.follower
}

// The community's listed group chats, read from the community node; Join /
// Ask to join go to the home node as SUBS { subject, audience: community }.
export function CommunityGroupsBrowser({ communityTag, onJoined }: CommunityGroupsBrowserProps) {
	const { t } = useTranslation()
	const toast = useToast()
	const [auth] = useAuth()
	const { api: home } = useApi()
	const { api: community } = useApi(communityTag)
	const level = roleLevel(useContextRolesFor(communityTag))
	const member = level > ROLE_LEVELS.follower
	const me = auth?.idTag

	const [groups, setGroups] = React.useState<ActionView[]>()
	const [counts, setCounts] = React.useState<Record<string, number>>({})
	// The viewer's own SUBS status per CONV on the community node: 'A' joined, 'C' requested.
	const [mine, setMine] = React.useState<Record<string, string>>({})
	const [error, setError] = React.useState(false)
	const [busy, setBusy] = React.useState<string>()
	const [reloadKey, setReloadKey] = React.useState(0)

	React.useEffect(() => {
		if (!community || !member) return
		let live = true
		setError(false)
		;(async () => {
			try {
				const convs = (await community.actions.list({ type: 'CONV' })) as ActionView[]
				if (!live) return
				setGroups(convs)
				if (!convs.length) return
				// member counts from one SUBS listing; 'C' rows show only to the
				// viewer's own knocks and to moderators, so counts stay 'A'-only.
				const subs = (await community.actions.list({
					type: 'SUBS',
					subject: convs.map((c) => c.actionId),
					status: ['A', 'C']
				})) as ActionView[]
				if (!live) return
				const n: Record<string, number> = {}
				const own: Record<string, string> = {}
				for (const s of subs) {
					if (!s.subject) continue
					if (s.status === 'A') n[s.subject] = (n[s.subject] ?? 0) + 1
					if (s.issuer?.idTag === me && s.status) own[s.subject] = s.status
				}
				setCounts(n)
				setMine(own)
			} catch (err) {
				console.error('Failed to load community group chats', err)
				if (live) setError(true)
			}
		})()
		return () => {
			live = false
		}
	}, [community, member, me, reloadKey])

	async function join(convId: string) {
		if (!home) return
		setBusy(convId)
		try {
			const res = await home.actions.create({
				type: 'SUBS',
				subject: convId,
				audienceTag: communityTag
			})
			if (res.status === 'D') toast.error(t('You can’t join this group'))
			else if (res.status === 'C') setMine((prev) => ({ ...prev, [convId]: 'C' }))
			else onJoined(convId)
		} catch (err) {
			console.error('Failed to join group', err)
			toast.error(t('Could not join the group'))
		} finally {
			setBusy(undefined)
		}
	}

	if (!member) return null
	if (error) {
		return (
			<EmptyState
				icon={<IcGroup />}
				title={t('Could not load group chats')}
				actions={<Button onClick={() => setReloadKey((k) => k + 1)}>{t('Retry')}</Button>}
			/>
		)
	}
	if (!groups) return <SkeletonList count={3} showAvatar />
	if (!groups.length) {
		return (
			<EmptyState
				icon={<IcGroup />}
				title={t('No group chats yet')}
				description={t('Group chats this community lists show up here.')}
			/>
		)
	}

	return (
		<List>
			{groups.map((g) => {
				const c = (g.content ?? {}) as GroupContent
				const status = mine[g.actionId]
				const canJoin =
					c.join === 'role' && level >= ROLE_LEVELS[c.joinMinRole ?? 'supporter']
				let action: React.ReactNode
				if (status === 'A') {
					action = (
						<Button size="sm" onClick={() => onJoined(g.actionId)}>
							{t('Open')}
						</Button>
					)
				} else if (status === 'C') {
					action = (
						<Text size="sm" emphasis="muted">
							{t('Requested')}
						</Text>
					)
				} else {
					action = (
						<Button
							size="sm"
							color={canJoin ? 'primary' : undefined}
							loading={busy === g.actionId}
							disabled={!!busy}
							onClick={() => join(g.actionId)}
						>
							{canJoin ? t('Join') : t('Ask to join')}
						</Button>
					)
				}
				return (
					<ListItem
						key={g.actionId}
						leading={<IcGroup />}
						title={c.name || t('Unnamed Group')}
						subtitle={c.description}
						meta={
							counts[g.actionId] !== undefined &&
							t('{{count}} members', { count: counts[g.actionId] })
						}
						trailing={action}
					/>
				)
			})}
		</List>
	)
}

// vim: ts=4
