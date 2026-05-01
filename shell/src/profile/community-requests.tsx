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

interface PendingRequestsListProps {
	communityIdTag: string
	getClientFor: (
		idTag: string,
		opts?: { auth?: 'required' | 'preferred' | 'none' }
	) => ApiClient | null
	onChange: () => void
}

export function PendingRequestsList({
	communityIdTag,
	getClientFor,
	onChange
}: PendingRequestsListProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()
	const [requests, setRequests] = React.useState<ActionView[] | undefined>(undefined)
	const [busyId, setBusyId] = React.useState<string | undefined>()

	const reload = React.useCallback(async () => {
		const client = getClientFor(communityIdTag)
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
			setRequests(rs)
		} catch (err) {
			console.error('Failed to load pending requests', err)
			toast.error(t('Failed to load requests'))
			setRequests([])
		}
	}, [communityIdTag, getClientFor, toast, t])

	React.useEffect(() => {
		reload()
	}, [reload])

	async function handleApprove(action: ActionView) {
		const confirmed = await dialog.confirm(
			t('Approve'),
			t('Are you sure you want to approve this request?')
		)
		if (!confirmed) return
		const client = getClientFor(communityIdTag)
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
			'error'
		)
		if (!confirmed) return
		const client = getClientFor(communityIdTag)
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
		return (
			<div className="c-panel p-3">
				<p className="text-muted">{t('No pending requests.')}</p>
			</div>
		)
	}

	return (
		<>
			{requests.map((action) => {
				const message = typeof action.content === 'string' ? action.content : undefined
				const busy = busyId === action.actionId
				return (
					<div
						key={action.actionId}
						className={mergeClasses('c-panel p-3 mb-2 g-2 d-flex flex-column')}
					>
						<div className="c-hbox g-2 ai-center">
							<ProfileCard className="flex-fill" profile={action.issuer} />
							<TimeFormat time={action.createdAt} />
						</div>
						{message && <p className="m-0">{message}</p>}
						<div className="c-hbox g-2 jc-end">
							<Button
								variant="primary"
								disabled={busy}
								onClick={() => handleApprove(action)}
							>
								{t('Approve')}
							</Button>
							<Button disabled={busy} onClick={() => handleReject(action)}>
								{t('Reject')}
							</Button>
						</div>
					</div>
				)
			})}
		</>
	)
}

// vim: ts=4
