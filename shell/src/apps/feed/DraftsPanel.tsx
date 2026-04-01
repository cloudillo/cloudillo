// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuSave as IcDraft } from 'react-icons/lu'

import type { ActionView } from '@cloudillo/types'
import { useApi, EmptyState, SkeletonCard } from '@cloudillo/react'

import { DraftCard } from './DraftCard.js'

export interface DraftsPanelProps {
	onEdit: (draft: ActionView) => void
	onPublished: (action: ActionView) => void
}

export function DraftsPanel({ onEdit, onPublished }: DraftsPanelProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [drafts, setDrafts] = React.useState<ActionView[]>([])
	const [isLoading, setIsLoading] = React.useState(true)

	React.useEffect(() => {
		if (!api) return
		;(async function loadDrafts() {
			setIsLoading(true)
			try {
				const result = await api.actions.listPaginated({
					type: 'POST',
					status: ['R', 'S']
				})
				// Sort: scheduled first (by createdAt ascending), then drafts (by createdAt desc)
				const sorted = result.data.sort((a, b) => {
					const aScheduled = a.status === 'S'
					const bScheduled = b.status === 'S'
					if (aScheduled !== bScheduled) return aScheduled ? -1 : 1
					if (aScheduled && bScheduled) {
						// Both scheduled: sort by createdAt ascending (publish_at is stored in created_at)
						return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
					}
					const aTime =
						typeof a.createdAt === 'string'
							? new Date(a.createdAt).getTime()
							: a.createdAt
					const bTime =
						typeof b.createdAt === 'string'
							? new Date(b.createdAt).getTime()
							: b.createdAt
					return bTime - aTime
				})
				setDrafts(sorted)
			} catch (e) {
				console.error('Failed to load drafts', e)
			} finally {
				setIsLoading(false)
			}
		})()
	}, [api])

	function handleDeleted(actionId: string) {
		setDrafts((prev) => prev.filter((d) => d.actionId !== actionId))
	}

	function handlePublished(action: ActionView) {
		setDrafts((prev) => prev.filter((d) => d.actionId !== action.actionId))
		onPublished(action)
	}

	function handleUnscheduled(action: ActionView) {
		setDrafts((prev) => prev.map((d) => (d.actionId === action.actionId ? action : d)))
	}

	if (isLoading) {
		return (
			<div className="c-vbox g-2 p-2">
				<SkeletonCard lines={2} />
				<SkeletonCard lines={2} />
			</div>
		)
	}

	if (drafts.length === 0) {
		return (
			<EmptyState
				icon={<IcDraft style={{ fontSize: '2.5rem' }} />}
				title={t('No drafts or scheduled posts')}
				description={t('Posts you save or schedule will appear here.')}
			/>
		)
	}

	return (
		<div className="c-vbox g-1">
			{drafts.map((draft) => (
				<DraftCard
					key={draft.actionId}
					draft={draft}
					onEdit={onEdit}
					onPublished={handlePublished}
					onDeleted={handleDeleted}
					onUnscheduled={handleUnscheduled}
				/>
			))}
		</div>
	)
}

// vim: ts=4
