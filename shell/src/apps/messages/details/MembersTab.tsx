// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Button,
	HBox,
	Heading,
	IcMore,
	List,
	ListItem,
	Menu,
	MenuItem,
	ProfileCard,
	SkeletonList,
	Text,
	useApi,
	useDialog,
	useToast,
	VBox
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcInvite } from '../../../icons.js'
import type { Conversation, ConversationMember, MemberRole } from '../types.js'
import { communityMappedRole, effectiveRole, MEMBER_ROLES } from '../types.js'
import { InviteDialog } from './InviteDialog.js'

export interface MembersTabProps {
	conversation: Conversation
	members?: ConversationMember[]
	me?: string
	/** The viewer's effective role (`effectiveRole`) */
	myRole?: MemberRole
	/** The viewer has left: read-only list */
	readOnly?: boolean
	/** Community roles of the members, community groups only (`useCommunityMemberRoles`) */
	communityRoles: Map<string, string[]>
	/** After a membership change (reload members) */
	onChanged: () => void
}

const rank = (r: MemberRole | undefined) => (r ? MEMBER_ROLES.indexOf(r) : -1)

// Members grouped by role in full words, per-member ⋯ actions gated by the viewer's
// effective role, invites with revoke, and the knock queue ("Requests to join").
export function MembersTab({
	conversation,
	members,
	me,
	myRole,
	readOnly,
	communityRoles,
	onChanged
}: MembersTabProps) {
	const { t } = useTranslation()
	const toast = useToast()
	const dialog = useDialog()
	// Admin ops: a community group's go to the owning community node, a personal group's
	// stay on the home node (useApi(undefined) = home).
	const community = conversation.communityTag
	const { api } = useApi(community)
	// SUBS membership ops are issued from the home node, like CONV:UPD.
	const { api: homeApi } = useApi()
	const [requests, setRequests] = React.useState<ConversationMember[]>([])
	const [inviteOpen, setInviteOpen] = React.useState(false)
	const [reloadKey, setReloadKey] = React.useState(0)

	const canModerate = !readOnly && rank(myRole) >= rank('moderator')
	const isAdmin = !readOnly && myRole === 'admin'

	// Knock queue: the same query as the knock probe (read-position.ts), on the community node.
	React.useEffect(() => {
		if (!api || !community || !canModerate) {
			setRequests([])
			return
		}
		let live = true
		;(
			api.actions.list({
				type: 'SUBS',
				subject: conversation.id,
				status: 'C'
			}) as Promise<ActionView[]>
		)
			.then((res) => {
				if (!live) return
				setRequests(
					res.map((subs) => ({
						profile: subs.issuer,
						role: 'observer',
						status: 'requested',
						actionId: subs.actionId,
						joinedAt: String(subs.createdAt)
					}))
				)
			})
			.catch((err) => console.error('Failed to load join requests', err))
		return () => {
			live = false
		}
	}, [api, community, canModerate, conversation.id, reloadKey])

	async function run(op: () => Promise<unknown>, error: string) {
		try {
			await op()
			setReloadKey((k) => k + 1)
			onChanged()
		} catch (err) {
			console.error(error, err)
			toast.error(error)
		}
	}

	// Membership operations. SUBS always needs the CONV host as audience.
	const audienceTag = conversation.ownerTag
	function setRole(m: ConversationMember, role: MemberRole) {
		if (!homeApi) return
		// SUBS:ROLE: on our own group it applies at once, otherwise the host applies it once it
		// approves, and the WS reload (useMessages) shows the final role.
		run(async () => {
			await homeApi.actions.create({
				type: 'SUBS',
				subType: 'ROLE',
				subject: m.actionId,
				audienceTag: audienceTag === me ? undefined : audienceTag,
				content: { role }
			})
			toast.success(t('Role change sent'))
		}, t('Could not change the role'))
	}
	async function removeMember(m: ConversationMember) {
		if (!api || !homeApi) return
		const ok = await dialog.confirm(
			t('Remove from group'),
			t('Remove {{name}} from "{{group}}"?', {
				name: m.profile.name || m.profile.idTag,
				group: conversation.name
			})
		)
		if (!ok) return
		run(
			() =>
				// A community group's kick is a reject of the member's SUBS.
				community
					? api.actions.reject(m.actionId)
					: homeApi.actions.create({
							type: 'SUBS',
							subType: 'DEL',
							subject: m.actionId,
							audienceTag
						}),
			t('Could not remove the member')
		)
	}
	function revokeInvite(m: ConversationMember) {
		if (!api) return
		run(
			() =>
				api.actions.create({
					type: 'INVT',
					subType: 'DEL',
					subject: conversation.id,
					audienceTag: m.profile.idTag
				}),
			t('Could not revoke the invitation')
		)
	}
	function answerRequest(m: ConversationMember, accept: boolean) {
		if (!api) return
		run(
			() => (accept ? api.actions.accept(m.actionId) : api.actions.reject(m.actionId)),
			t('Could not answer the request')
		)
	}

	if (members === undefined) return <SkeletonList count={3} showAvatar />

	const roleNames: Record<MemberRole, string> = {
		admin: t('Make admin'),
		moderator: t('Make moderator'),
		member: t('Make member'),
		observer: t('Make observer')
	}

	// Effective role per member; the CONV owner is always admin.
	const shown = members.map((m) => {
		if (m.status !== 'active') return { m, role: m.role, mapped: undefined }
		const roles = community ? communityRoles.get(m.profile.idTag) : undefined
		const subsRole = m.profile.idTag === conversation.ownerTag ? 'admin' : m.role
		return {
			m,
			role: effectiveRole(subsRole, roles) ?? m.role,
			mapped: roles && communityMappedRole(roles) ? roles : undefined
		}
	})
	const active = (role: MemberRole) =>
		shown.filter((x) => x.m.status === 'active' && x.role === role)
	const sections: [string, typeof shown][] = [
		...(canModerate && requests.length
			? [
					[
						t('Requests to join'),
						requests.map((m) => ({ m, role: m.role, mapped: undefined }))
					] as [string, typeof shown]
				]
			: []),
		[t('Admins'), active('admin')],
		[t('Moderators'), active('moderator')],
		[t('Members'), active('member')],
		[t('Observers — can read, but can’t post'), active('observer')],
		[t('Invited'), shown.filter((x) => x.m.status === 'invited')]
	]

	function actions(x: (typeof shown)[number]) {
		const { m, role, mapped } = x
		if (m.profile.idTag === me) return undefined
		if (m.status === 'requested') {
			return (
				<HBox gap={1}>
					<Button size="sm" color="primary" onClick={() => answerRequest(m, true)}>
						{t('Accept')}
					</Button>
					<Button size="sm" onClick={() => answerRequest(m, false)}>
						{t('Decline')}
					</Button>
				</HBox>
			)
		}
		const items: React.ReactNode[] = []
		if (m.status === 'invited' && canModerate) {
			items.push(
				<MenuItem key="revoke" label={t('Revoke invite')} onClick={() => revokeInvite(m)} />
			)
		}
		if (m.status === 'active') {
			// Community-mapped roles can't be demoted from the group UI.
			if (isAdmin && !mapped && m.profile.idTag !== conversation.ownerTag) {
				for (const r of [...MEMBER_ROLES].reverse()) {
					if (r !== role)
						items.push(
							<MenuItem key={r} label={roleNames[r]} onClick={() => setRole(m, r)} />
						)
				}
			}
			// Kick: moderator+, and only someone ranked below us (admins may remove admins).
			if (canModerate && (isAdmin || rank(role) < rank(myRole))) {
				items.push(
					<MenuItem
						key="remove"
						danger
						label={t('Remove from group')}
						onClick={() => removeMember(m)}
					/>
				)
			}
		}
		if (!items.length) return undefined
		return (
			<Menu
				placement="bottom-end"
				trigger={
					<Button
						variant="ghost"
						size="sm"
						icon={<IcMore />}
						aria-label={t('Actions for {{name}}', {
							name: m.profile.name || m.profile.idTag
						})}
					/>
				}
			>
				{items}
			</Menu>
		)
	}

	function note(x: (typeof shown)[number]) {
		const parts: string[] = []
		if (x.m.profile.idTag === me) parts.push(t('You'))
		if (x.mapped)
			parts.push(
				communityMappedRole(x.mapped) === 'admin'
					? t('Community leader')
					: t('Community moderator')
			)
		return parts.join(' · ') || undefined
	}

	return (
		<VBox gap={2} className="p-2">
			{canModerate && (
				<Button variant="ghost" icon={<IcInvite />} onClick={() => setInviteOpen(true)}>
					{t('Invite people')}
				</Button>
			)}
			{sections
				.filter(([, list]) => list.length)
				.map(([title, list]) => (
					<VBox key={title} gap={1}>
						<Heading level={5} className="px-2">
							{title} <Text emphasis="muted">({list.length})</Text>
						</Heading>
						<List>
							{list.map((x) => (
								<ListItem
									key={x.m.actionId}
									title={
										<ProfileCard
											profile={x.m.profile}
											className="small"
											badges={false}
										/>
									}
									subtitle={note(x)}
									trailing={actions(x)}
								/>
							))}
						</List>
					</VBox>
				))}
			<InviteDialog
				open={inviteOpen}
				onClose={() => setInviteOpen(false)}
				conversation={conversation}
				members={members}
				onInvited={() => {
					setInviteOpen(false)
					onChanged()
				}}
			/>
		</VBox>
	)
}

// vim: ts=4
