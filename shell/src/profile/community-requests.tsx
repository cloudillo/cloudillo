// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import {
	Button,
	EmptyState,
	IdentityTag,
	List,
	ListItem,
	ProfilePicture,
	TimeFormat,
	useDialog,
	useToast
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { inviteMessage } from '../notifications/NotificationItem.js'

interface PendingRequestsListProps {
	communityIdTag: string
	getClientFor: (
		idTag: string,
		opts?: { auth?: 'required' | 'preferred' | 'none'; explicit?: boolean }
	) => ApiClient | null
	onChange: () => void
	/** Narrows the listed requests, e.g. to community issuers on the partners page. */
	filter?: (action: ActionView) => boolean
}

export function PendingRequestsList({
	communityIdTag,
	getClientFor,
	onChange,
	filter
}: PendingRequestsListProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()
	const [requests, setRequests] = React.useState<ActionView[] | undefined>(undefined)
	const [busyId, setBusyId] = React.useState<string | undefined>()

	const reload = React.useCallback(async () => {
		// Explicit: leader-only management data, unreadable anonymously.
		const client = getClientFor(communityIdTag, { explicit: true })
		if (!client) {
			setRequests([])
			return
		}
		try {
			const rs = (await client.actions.list({
				type: 'CONN',
				audience: communityIdTag,
				status: ['C', 'P']
			})) as ActionView[]
			setRequests(filter ? rs.filter(filter) : rs)
		} catch (err) {
			console.error('Failed to load pending requests', err)
			toast.error(t('Failed to load requests'))
			setRequests([])
		}
	}, [communityIdTag, getClientFor, filter, toast, t])

	React.useEffect(() => {
		reload()
	}, [reload])

	async function handleApprove(action: ActionView) {
		const confirmed = await dialog.confirm(
			t('Approve'),
			t('Are you sure you want to approve this request?'),
			{ confirmLabel: t('Approve') }
		)
		if (!confirmed) return
		const client = getClientFor(communityIdTag, { explicit: true })
		if (!client) return
		setBusyId(action.actionId)
		try {
			await client.actions.accept(action.actionId)
			toast.success(t('Request approved'))
			setRequests((prev) => prev?.filter((r) => r.actionId !== action.actionId))
			onChange()
		} catch (err) {
			console.error('Failed to approve request', err)
			toast.error(t('Failed to approve request'))
		} finally {
			setBusyId(undefined)
		}
	}

	async function handleReject(action: ActionView) {
		const confirmed = await dialog.confirm(
			t('Reject'),
			t('Are you sure you want to reject this request?'),
			{ color: 'error', confirmLabel: t('Reject') }
		)
		if (!confirmed) return
		const client = getClientFor(communityIdTag, { explicit: true })
		if (!client) return
		setBusyId(action.actionId)
		try {
			await client.actions.reject(action.actionId)
			toast.success(t('Request rejected'))
			setRequests((prev) => prev?.filter((r) => r.actionId !== action.actionId))
			onChange()
		} catch (err) {
			console.error('Failed to reject request', err)
			toast.error(t('Failed to reject request'))
		} finally {
			setBusyId(undefined)
		}
	}

	if (requests === undefined) return null
	if (requests.length === 0) {
		return <EmptyState className="auto-bg" size="sm" title={t('No pending requests')} />
	}

	return (
		<List variant="divided" aria-label={t('Pending requests')}>
			{requests.map((action) => {
				const message = inviteMessage(action)
				const busy = busyId === action.actionId
				return (
					<ListItem
						key={action.actionId}
						leading={<ProfilePicture profile={action.issuer} />}
						title={action.issuer.name || action.issuer.idTag}
						subtitle={message ?? <IdentityTag idTag={action.issuer.idTag} />}
						meta={<TimeFormat time={action.createdAt} />}
						trailing={
							/* Consent decision, both options carry equal weight */
							<>
								<Button disabled={busy} onClick={() => handleReject(action)}>
									{t('Reject')}
								</Button>
								<Button disabled={busy} onClick={() => handleApprove(action)}>
									{t('Approve')}
								</Button>
							</>
						}
					/>
				)
			})}
		</List>
	)
}

// vim: ts=4
