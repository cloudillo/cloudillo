// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Card,
	HBox,
	IconText,
	Menu,
	MenuItem,
	Spacer,
	Text,
	TimeFormat,
	useApi,
	useDialog,
	VBox
} from '@cloudillo/react'
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
				: t('Delete this draft? This cannot be undone.'),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (!confirmed) return

		try {
			await api.actions.delete(draft.actionId)
			onDeleted(draft.actionId)
		} catch (e) {
			console.error('Failed to delete draft', e)
		}
	}

	const tone = isOverdue ? 'error' : isScheduled ? 'primary' : 'warning'
	const kindLabel =
		draft.subType === 'LDOC'
			? t('live document')
			: draft.subType === 'VIDEO'
				? t('video')
				: draft.subType === 'DOC'
					? t('document')
					: attachmentCount === 1
						? t('image')
						: t('images')
	const KindIcon =
		draft.subType === 'VIDEO'
			? IcVideo
			: draft.subType === 'LDOC' || draft.subType === 'DOC'
				? IcDocument
				: IcImage

	return (
		<Card color={tone} variant="outline">
			<VBox gap={2}>
				<HBox gap={2} align="center">
					<Text size="sm" weight="bold" color={tone}>
						<IconText icon={isScheduled ? <IcSchedule /> : <IcDraft />}>
							{isScheduled
								? isOverdue
									? t('Schedule overdue')
									: t('SCHEDULED')
								: t('DRAFT')}
						</IconText>
					</Text>
					<Spacer />
					<Text size="sm" emphasis="muted">
						{isScheduled && publishAt ? (
							<TimeFormat time={publishAt.toISOString()} />
						) : (
							<>
								{t('Last edited:')} <TimeFormat time={draft.createdAt} />
							</>
						)}
					</Text>
				</HBox>
				{contentPreview ? (
					<Text as="p">{contentPreview}</Text>
				) : attachmentCount > 0 || draft.subType === 'LDOC' ? (
					<Text as="p" emphasis="muted">
						({t('No text')} - {attachmentCount > 0 ? `${attachmentCount} ` : ''}
						<IconText icon={<KindIcon />}>{kindLabel}</IconText>)
					</Text>
				) : (
					<Text as="p" emphasis="muted">
						({t('Empty draft')})
					</Text>
				)}
				<HBox gap={2}>
					<Button size="sm" onClick={() => onEdit(draft)}>
						<IcEdit />
						{t('Edit')}
					</Button>
					<Button size="sm" color="primary" onClick={handlePublishNow}>
						<IcPublish />
						{t('Publish now')}
					</Button>
					<Menu
						trigger={
							<Button variant="ghost" size="sm" aria-label={t('More actions')}>
								<IcMore />
							</Button>
						}
					>
						{isScheduled && (
							<MenuItem
								icon={<IcUnschedule />}
								label={t('Unschedule')}
								onClick={handleUnschedule}
							/>
						)}
						<MenuItem
							icon={<IcDelete />}
							label={isScheduled ? t('Delete scheduled post') : t('Delete draft')}
							color="error"
							onClick={handleDelete}
						/>
					</Menu>
				</HBox>
			</VBox>
		</Card>
	)
}

// vim: ts=4
