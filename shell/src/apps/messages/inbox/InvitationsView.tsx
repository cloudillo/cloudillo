// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Alert,
	Avatar,
	Button,
	Card,
	EmptyState,
	HBox,
	Heading,
	IcBack,
	Icon,
	ProfilePicture,
	Text,
	useApi,
	VBox
} from '@cloudillo/react'
import type { ActionView, Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcGroup, IcInvitation } from '../../../icons.js'
import { GroupAvatar } from '../components/GroupAvatar.js'
import type { ConvContent } from '../types.js'

export interface InvitationsViewProps {
	invites: ActionView[] | undefined
	/** Reject to have the view show the failure on that invite. */
	onAccept: (invite: ActionView) => Promise<void>
	onDecline: (invite: ActionView) => Promise<void>
	onBack: () => void
}

type InviteContent = { groupName?: string; message?: string } | string | undefined

// Members per invited group, as far as the home node knows them (a remote group's
// members are usually unknown until joined — then the card just omits them).
function useInviteMembers(invites: ActionView[] | undefined): Map<string, Profile[]> {
	const { api } = useApi()
	const [members, setMembers] = React.useState<Map<string, Profile[]>>(new Map())
	const ids = (invites ?? []).flatMap((i) => (i.subject ? [i.subject] : []))
	const key = ids.join(',')

	React.useEffect(
		function loadInviteMembers() {
			const subject = key ? key.split(',') : []
			if (!api || !subject.length) return
			const ac = new AbortController()
			;(async function () {
				try {
					const subs = (await api.actions.list({
						type: 'SUBS',
						subject,
						status: 'A'
					})) as ActionView[]
					if (ac.signal.aborted) return
					const byGroup = new Map<string, Profile[]>()
					for (const s of subs) {
						if (s.subType === 'DEL' || !s.subject) continue
						byGroup.set(s.subject, [...(byGroup.get(s.subject) ?? []), s.issuer])
					}
					setMembers(byGroup)
				} catch (err) {
					console.error('Failed to load invited group members', err)
				}
			})()
			return () => ac.abort()
		},
		[api, key]
	)
	return members
}

function InvitationCard({
	invite,
	members,
	onAccept,
	onDecline
}: {
	invite: ActionView
	members?: Profile[]
	onAccept: InvitationsViewProps['onAccept']
	onDecline: InvitationsViewProps['onDecline']
}) {
	const { t } = useTranslation()
	const [busy, setBusy] = React.useState<'accept' | 'decline'>()
	const [failed, setFailed] = React.useState<'accept' | 'decline'>()

	const content = invite.content as InviteContent
	const conv =
		invite.subjectAction?.type === 'CONV'
			? (invite.subjectAction.content as ConvContent | undefined)
			: undefined
	// Peer-supplied content: unknown keys pass the backend schema, so check every field's type.
	const groupName =
		(typeof conv?.name === 'string' ? conv.name : undefined) ||
		(typeof content === 'object' && typeof content?.groupName === 'string'
			? content.groupName
			: undefined) ||
		t('Group invitation')
	const message =
		typeof content === 'string'
			? content
			: typeof content?.message === 'string'
				? content.message
				: undefined

	async function act(kind: 'accept' | 'decline') {
		setBusy(kind)
		setFailed(undefined)
		try {
			await (kind === 'accept' ? onAccept : onDecline)(invite)
		} catch {
			setFailed(kind)
			setBusy(undefined)
		}
	}

	return (
		<Card>
			<VBox gap={2}>
				<HBox gap={2} align="center">
					{members && members.length > 1 ? (
						<GroupAvatar profiles={members} />
					) : (
						<Avatar size="md" fallback={<Icon as={IcGroup} />} />
					)}
					<VBox className="flex-fill w-min-0">
						<Heading level={3} className="text-truncate">
							{groupName}
						</Heading>
						{!!members?.length && (
							<Text size="sm" emphasis="muted">
								{t('{{count}} members', { count: members.length })}
							</Text>
						)}
					</VBox>
				</HBox>
				{conv?.description && <Text>{conv.description}</Text>}
				<HBox gap={1} align="center">
					<ProfilePicture profile={invite.issuer} size="xs" />
					<Text size="sm">
						{t('Invited by {{name}}', {
							name: invite.issuer.name || invite.issuer.idTag
						})}
					</Text>
				</HBox>
				{message && (
					<Text as="p" emphasis="muted">
						{message}
					</Text>
				)}
				{failed && (
					<Alert color="error" compact>
						{failed === 'accept'
							? t('Could not accept the invitation')
							: t('Could not decline the invitation')}
					</Alert>
				)}
				<HBox gap={2} justify="end">
					<Button
						variant="ghost"
						disabled={!!busy}
						loading={busy === 'decline'}
						onClick={() => act('decline')}
					>
						{t('Decline')}
					</Button>
					<Button
						color="primary"
						disabled={!!busy}
						loading={busy === 'accept'}
						onClick={() => act('accept')}
					>
						{t('Accept')}
					</Button>
				</HBox>
			</VBox>
		</Card>
	)
}

// Pending group invitations: one card each with labeled Accept / Decline.
export function InvitationsView({ invites, onAccept, onDecline, onBack }: InvitationsViewProps) {
	const { t } = useTranslation()
	const members = useInviteMembers(invites)

	return (
		<VBox gap={2} className="h-100 overflow-y-auto p-2">
			<HBox gap={1} align="center">
				<Button variant="ghost" icon={<IcBack />} aria-label={t('Back')} onClick={onBack} />
				<Heading level={2} className="flex-fill">
					{t('Invitations')}
				</Heading>
			</HBox>
			{invites && invites.length > 0 ? (
				invites.map((invite) => (
					<InvitationCard
						key={invite.actionId}
						invite={invite}
						members={invite.subject ? members.get(invite.subject) : undefined}
						onAccept={onAccept}
						onDecline={onDecline}
					/>
				))
			) : (
				<EmptyState
					icon={<IcInvitation />}
					title={t('No pending invitations')}
					description={t('Group invitations you receive appear here')}
				/>
			)}
		</VBox>
	)
}

// vim: ts=4
