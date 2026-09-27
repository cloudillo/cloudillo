// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import {
	ActionBar,
	Badge,
	Button,
	Card,
	EmptyState,
	HBox,
	ProfileCard,
	Text,
	TimeFormat,
	useDialog,
	useToast,
	VBox
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

interface InvitationsListProps {
	communityIdTag: string
	getClientFor: (
		idTag: string,
		opts?: { auth?: 'required' | 'preferred' | 'none'; explicit?: boolean }
	) => ApiClient | null
	/** Id tags of invitees who have already accepted (connected members). */
	connectedMemberTags: Set<string>
	onChange: () => void
}

export function InvitationsList({
	communityIdTag,
	getClientFor,
	connectedMemberTags,
	onChange
}: InvitationsListProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()
	const [invitations, setInvitations] = React.useState<ActionView[] | undefined>(undefined)
	const [busyId, setBusyId] = React.useState<string | undefined>()

	const reload = React.useCallback(async () => {
		// Explicit: leader-only management data, unreadable anonymously.
		const client = getClientFor(communityIdTag, { explicit: true })
		if (!client) {
			setInvitations([])
			return
		}
		try {
			// The community-home INVT copy rests at 'A' and never changes on
			// acceptance (INVT has requires_acceptance:false), so status is not a
			// usable "accepted" signal here. Acceptance is signalled by the
			// invitee becoming a connected member. The status filter excludes
			// revoked/declined ('D'/'R') rows server-side; the remaining
			// client-side filter drops invitees who are already members.
			const rs = (await client.actions.list({
				type: 'INVT',
				subject: '@' + communityIdTag,
				status: ['C', 'P', 'A']
			})) as ActionView[]
			const pending = rs.filter(
				(a) => !(a.audience?.idTag && connectedMemberTags.has(a.audience.idTag))
			)
			setInvitations(pending)
		} catch (err) {
			console.error('Failed to load invitations', err)
			toast.error(t('Failed to load invitations'))
			setInvitations([])
		}
	}, [communityIdTag, getClientFor, connectedMemberTags, toast, t])

	React.useEffect(() => {
		reload()
	}, [reload])

	async function handleRevoke(action: ActionView) {
		const confirmed = await dialog.confirm(
			t('Revoke invitation'),
			t('Are you sure you want to revoke this invitation?'),
			{ color: 'error', confirmLabel: t('Revoke') }
		)
		if (!confirmed) return
		const client = getClientFor(communityIdTag, { explicit: true })
		if (!client) return
		setBusyId(action.actionId)
		try {
			await client.actions.delete(action.actionId)
			toast.success(t('Invitation revoked'))
			setInvitations((prev) => prev?.filter((r) => r.actionId !== action.actionId))
			onChange()
		} catch (err) {
			console.error('Failed to revoke invitation', err)
			toast.error(t('Failed to revoke invitation'))
		} finally {
			setBusyId(undefined)
		}
	}

	if (invitations === undefined) return null
	if (invitations.length === 0) {
		return <EmptyState className="auto-bg" size="sm" title={t('No invitations sent.')} />
	}

	return (
		<VBox gap={2}>
			{invitations.map((action) => {
				const busy = busyId === action.actionId
				const invitee = action.audience
				return (
					<Card key={action.actionId} padding={3}>
						<HBox gap={2} align="center">
							{invitee ? (
								<ProfileCard className="flex-fill" profile={invitee} />
							) : (
								<Text emphasis="muted" className="flex-fill">
									{t('(unknown)')}
								</Text>
							)}
							<Badge variant="soft">{t('Pending')}</Badge>
							<TimeFormat time={action.createdAt} />
						</HBox>
						{action.issuer && (
							<Text as="p" size="sm" emphasis="muted">
								{t('invited by {{name}}', {
									name: action.issuer.name || action.issuer.idTag
								})}
							</Text>
						)}
						<ActionBar>
							<Button disabled={busy} onClick={() => handleRevoke(action)}>
								{t('Revoke invitation')}
							</Button>
						</ActionBar>
					</Card>
				)
			})}
		</VBox>
	)
}

// vim: ts=4
