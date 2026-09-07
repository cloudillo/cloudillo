// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Popper, TimeFormat, useApi, useDialog } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTrash2 as IcDelete,
	LuFileText as IcDocument,
	LuPencilLine as IcDraft,
	LuPencil as IcEdit,
	LuImage as IcImage,
	LuEllipsis as IcMore,
	LuSendHorizontal as IcPublish,
	LuCalendarClock as IcSchedule,
	LuCalendarX2 as IcUnschedule,
	LuVideo as IcVideo
} from 'react-icons/lu'

import { parseLiveDocContent } from './live-doc.js'

export interface DraftCardProps {
	draft: ActionView
	onEdit: (draft: ActionView) => void
	onPublished: (draft: ActionView) => void
	onDeleted: (actionId: string) => void
	onUnscheduled: (draft: ActionView) => void
}

export function DraftCard({
	draft,
	onEdit,
	onPublished,
	onDeleted,
	onUnscheduled
}: DraftCardProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const dialog = useDialog()

	const isScheduled = draft.status === 'S'
	// For scheduled drafts, the backend stores publish_at in created_at
	const publishAt = isScheduled ? new Date(draft.createdAt) : undefined
	const isOverdue = isScheduled && publishAt && publishAt.getTime() < Date.now()
	// An LDOC draft keeps its commentary in `content.text`; without this it falls
	// through to the "no text" branch even when the author wrote something.
	const draftText =
		typeof draft.content === 'string'
			? draft.content
			: draft.subType === 'LDOC'
				? parseLiveDocContent(draft.content)?.text
				: undefined
	const contentPreview =
		draftText && draftText.length > 120 ? draftText.slice(0, 120) + '...' : draftText
	const attachmentCount = draft.attachments?.length ?? 0

	async function handlePublishNow() {
		if (!api) return

		const message =
			isScheduled && publishAt
				? t('This post is scheduled for {{date}}. Publish immediately instead?', {
						date: publishAt.toLocaleString()
					})
				: t('Publish this post immediately?')

		const confirmed = await dialog.confirm(t('Publish now'), message)
		if (!confirmed) return

		try {
			const res = await api.actions.publish(draft.actionId)
			onPublished(res)
		} catch (e) {
			console.error('Failed to publish draft', e)
		}
	}

	async function handleUnschedule() {
		if (!api) return

		try {
			const res = await api.actions.cancel(draft.actionId)
			onUnscheduled(res)
		} catch (e) {
			console.error('Failed to unschedule', e)
		}
	}

	async function handleDelete() {
		if (!api) return

		const confirmed = await dialog.confirm(
			isScheduled ? t('Delete scheduled post') : t('Delete draft'),
			isScheduled
				? t('Delete this scheduled post? This cannot be undone.')
				: t('Delete this draft? This cannot be undone.')
		)
		if (!confirmed) return

		try {
			await api.actions.delete(draft.actionId)
			onDeleted(draft.actionId)
		} catch (e) {
			console.error('Failed to delete draft', e)
		}
	}

	return (
		<div
			className="c-panel g-2"
			style={{
				borderLeft: `4px solid var(${isOverdue ? '--col-error' : isScheduled ? '--col-primary' : '--col-warning'})`
			}}
		>
			<div className="c-hbox g-2 align-items-center">
				{isScheduled ? (
					<div
						className="c-hbox g-1 align-items-center"
						style={{ color: isOverdue ? 'var(--col-error)' : 'var(--col-primary)' }}
					>
						<IcSchedule />
						<span className="text-sm fw-bold">
							{isOverdue ? t('Schedule overdue') : t('SCHEDULED')}
						</span>
					</div>
				) : (
					<div
						className="c-hbox g-1 align-items-center"
						style={{ color: 'var(--col-warning)' }}
					>
						<IcDraft />
						<span className="text-sm fw-bold">{t('DRAFT')}</span>
					</div>
				)}
				<span className="ms-auto text-sm" style={{ opacity: 0.7 }}>
					{isScheduled && publishAt ? (
						<TimeFormat time={publishAt.toISOString()} />
					) : (
						<>
							{t('Last edited:')} <TimeFormat time={draft.createdAt} />
						</>
					)}
				</span>
			</div>
			<div>
				{contentPreview ? (
					<p style={{ margin: 0 }}>{contentPreview}</p>
				) : attachmentCount > 0 || draft.subType === 'LDOC' ? (
					<p style={{ margin: 0, opacity: 0.6, fontStyle: 'italic' }}>
						({t('No text')} - {attachmentCount > 0 ? `${attachmentCount} ` : ''}
						{draft.subType === 'LDOC' ? (
							<>
								<IcDocument style={{ verticalAlign: 'text-bottom' }} />{' '}
								{t('live document')}
							</>
						) : draft.subType === 'VIDEO' ? (
							<>
								<IcVideo style={{ verticalAlign: 'text-bottom' }} /> {t('video')}
							</>
						) : draft.subType === 'DOC' ? (
							<>
								<IcDocument style={{ verticalAlign: 'text-bottom' }} />{' '}
								{t('document')}
							</>
						) : (
							<>
								<IcImage style={{ verticalAlign: 'text-bottom' }} />{' '}
								{attachmentCount === 1 ? t('image') : t('images')}
							</>
						)}
						)
					</p>
				) : (
					<p style={{ margin: 0, opacity: 0.6, fontStyle: 'italic' }}>
						({t('Empty draft')})
					</p>
				)}
			</div>
			<div className="c-hbox g-2">
				<Button size="small" onClick={() => onEdit(draft)}>
					<IcEdit />
					{t('Edit')}
				</Button>
				<Button size="small" variant="primary" onClick={handlePublishNow}>
					<IcPublish />
					{t('Publish now')}
				</Button>
				<Popper menuClassName="c-button" icon={<IcMore />}>
					<ul className="c-nav vertical emph">
						{isScheduled && (
							<li>
								<Button kind="nav-item" onClick={handleUnschedule}>
									<IcUnschedule />
									{t('Unschedule')}
								</Button>
							</li>
						)}
						<li>
							<Button kind="nav-item" onClick={handleDelete}>
								<IcDelete style={{ color: 'var(--col-error)' }} />
								{isScheduled ? t('Delete scheduled post') : t('Delete draft')}
							</Button>
						</li>
					</ul>
				</Popper>
			</div>
		</div>
	)
}

// vim: ts=4
