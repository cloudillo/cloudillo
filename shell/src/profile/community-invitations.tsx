// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	Button,
	ProfileCard,
	useDialog,
	useToast,
	TimeFormat,
	mergeClasses
} from '@cloudillo/react'
import type { ApiClient } from '@cloudillo/core'
import type { ActionView } from '@cloudillo/types'

interface InvitationsListProps {
	communityIdTag: string
	getClientFor: (
		idTag: string,
		opts?: { auth?: 'required' | 'preferred' | 'none' }
	) => ApiClient | null
	onChange: () => void
}

function statusLabel(status: string | undefined, t: (k: string) => string): string {
	switch (status) {
		case 'A':
			return t('Accepted')
		case 'R':
		case 'D':
			return t('Declined')
		default:
			return t('Pending')
	}
}

export function InvitationsList({ communityIdTag, getClientFor, onChange }: InvitationsListProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()
	const [invitations, setInvitations] = React.useState<ActionView[] | undefined>(undefined)
	const [busyId, setBusyId] = React.useState<string | undefined>()

	const reload = React.useCallback(async () => {
		const client = getClientFor(communityIdTag)
		if (!client) {
			setInvitations([])
			return
		}
		try {
			const rs = (await client.actions.list({
				type: 'INVT',
				subject: '@' + communityIdTag,
				status: ['C', 'P', 'A']
			})) as ActionView[]
			setInvitations(rs)
		} catch (err) {
			console.error('Failed to load invitations', err)
			toast.error(t('Failed to load invitations'))
			setInvitations([])
		}
	}, [communityIdTag, getClientFor, toast, t])

	React.useEffect(() => {
		reload()
	}, [reload])

	async function handleRevoke(action: ActionView) {
		const confirmed = await dialog.confirm(
			t('Revoke invitation'),
			t('Are you sure you want to revoke this invitation?'),
			'error'
		)
		if (!confirmed) return
		const client = getClientFor(communityIdTag)
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
		return (
			<div className="c-panel p-3">
				<p className="text-muted">{t('No invitations sent.')}</p>
			</div>
		)
	}

	return (
		<>
			{invitations.map((action) => {
				const busy = busyId === action.actionId
				const isPending = action.status === 'C' || action.status === 'P'
				const invitee = action.audience
				return (
					<div
						key={action.actionId}
						className={mergeClasses('c-panel p-3 mb-2 g-2 d-flex flex-column')}
					>
						<div className="c-hbox g-2 ai-center">
							{invitee ? (
								<ProfileCard className="flex-fill" profile={invitee} />
							) : (
								<div className="flex-fill text-muted">{t('(unknown)')}</div>
							)}
							<span className="c-badge">{statusLabel(action.status, t)}</span>
							<TimeFormat time={action.createdAt} />
						</div>
						{action.issuer && (
							<p className="c-hint m-0">
								{t('invited by {{name}}', {
									name: action.issuer.name || action.issuer.idTag
								})}
							</p>
						)}
						{isPending && (
							<div className="c-hbox g-2 jc-end">
								<Button disabled={busy} onClick={() => handleRevoke(action)}>
									{t('Revoke invitation')}
								</Button>
							</div>
						)}
					</div>
				)
			})}
		</>
	)
}

// vim: ts=4
