// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Button,
	ChatBubble,
	HBox,
	IcError,
	Icon,
	IcRetry,
	Link,
	LoadingSpinner,
	type MenuPosition,
	PersonHover,
	ProfilePicture,
	RichText,
	Text,
	useAuth,
	VBox
} from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useCtx } from '../../../context/index.js'
import { IcSent } from '../../../icons.js'
import { createdAtToSeconds } from '../../../read-position.js'
import { profilePath } from '../../../routes.js'
import { getReactionLabel, parseReactionCounts } from '../../feed/reactions.js'
import type { ActionEvt } from '../types.js'
import { useTouchGestures } from '../../../ui/touch-gestures.js'
import { MessageActions, type MessageMenuSlots } from './MessageActions.js'
import { MessageAttachments } from './MessageAttachments.js'
import { ReplyQuote } from './ReplyQuote.js'

export interface MessageBubbleProps {
	action: ActionEvt
	local: boolean
	/** Render the sender card (start of a visual group) */
	showSender: boolean
	/** Render the timestamp (end of a visual group) */
	showTimestamp: boolean
	/** Jump target: ring for 2 s */
	highlighted: boolean
	/** The quoted message, when loaded in the window */
	replyTarget: ActionEvt | undefined
	/** Moderator+ in a group: may delete other people's messages */
	canModerate: boolean
	/** The sender's `@all` notifies (moderator+ in a group): render it as a pill */
	allowAll: boolean
	register?: (node: Element | null) => (() => void) | undefined
	onRetry: (tempId: string) => void
	onReact: (actionId: string, reaction: string) => void
	onReply: (action: ActionEvt) => void
	onEdit: (action: ActionEvt) => void
	onDelete: (action: ActionEvt) => void
	onJumpTo: (actionId: string, createdAt?: number) => void
	menuSlots?: MessageMenuSlots
}

function MessageBubbleComponent({
	action,
	local,
	showSender,
	showTimestamp,
	highlighted,
	replyTarget,
	canModerate,
	allowAll,
	register,
	onRetry,
	onReact,
	onReply,
	onEdit,
	onDelete,
	onJumpTo,
	menuSlots
}: MessageBubbleProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const urlContext = useCtx().base
	const [hover, setHover] = React.useState(false)
	const [focused, setFocused] = React.useState(false)
	const [menuAt, setMenuAt] = React.useState<MenuPosition | undefined>()

	const deletedBy = action.x?.deletedBy
	const deleted = !!deletedBy || action.content === null
	// Optimistic rows keep actionId === tempId until the server accepts them.
	const unsent = action.tempId !== undefined && action.actionId === action.tempId
	const actionable = !deleted && !unsent

	const { handlers, swipeX } = useTouchGestures({
		enabled: actionable,
		onMenu: setMenuAt,
		onSwipeRight: () => onReply(action)
	})

	const senderName = action.issuer.name || action.issuer.idTag
	const tempId = action.tempId
	const reactions = parseReactionCounts(action.stat?.reactions)
	const ownReaction = action.stat?.ownReaction
	const replyId = action.subject

	return (
		<ChatBubble
			ref={register}
			side={local ? 'end' : 'start'}
			data-read-ts={createdAtToSeconds(action.createdAt)}
			tabIndex={actionable ? 0 : undefined}
			className={[showSender ? 'mt-2 mb-1' : 'mb-1', highlighted && 'ring-primary']
				.filter(Boolean)
				.join(' ')}
			style={{
				position: 'relative',
				...(swipeX ? { transform: `translateX(${swipeX}px)` } : {})
			}}
			onPointerEnter={(evt) => {
				if (evt.pointerType === 'mouse') setHover(true)
			}}
			onPointerLeave={(evt) => {
				if (evt.pointerType === 'mouse') setHover(false)
			}}
			onFocus={() => setFocused(true)}
			onBlur={(evt) => {
				if (!evt.currentTarget.contains(evt.relatedTarget as Node | null)) setFocused(false)
			}}
			{...handlers}
		>
			{actionable && (
				<MessageActions
					action={action}
					visible={hover || focused}
					side={local ? 'end' : 'start'}
					menuAt={menuAt}
					onMenuClose={() => setMenuAt(undefined)}
					canEdit={local}
					canDelete={local || canModerate}
					onReact={(key) => onReact(action.actionId, key)}
					onReply={() => onReply(action)}
					onEdit={() => onEdit(action)}
					onDelete={() => onDelete(action)}
					pinItem={menuSlots?.pin?.(action)}
					seenByItem={menuSlots?.seenBy?.(action)}
				/>
			)}
			{showSender && (
				// One Link holds avatar and name, so the card hangs off both here
				<PersonHover idTag={action.issuer.idTag}>
					<Link href={profilePath(urlContext, action.issuer.idTag)} className="mb-1">
						<HBox align="center" gap={1}>
							<ProfilePicture profile={action.issuer} size="xs" />
							<Text size="sm" weight="semibold" truncate>
								{senderName}
							</Text>
						</HBox>
					</Link>
				</PersonHover>
			)}
			{deleted ? (
				<Text emphasis="muted" style={{ fontStyle: 'italic' }}>
					{deletedBy && deletedBy !== action.issuer.idTag
						? t('Removed by moderator')
						: t('Message deleted')}
				</Text>
			) : (
				<VBox>
					{replyId && (
						<ReplyQuote
							subjectId={replyId}
							target={replyTarget ?? (action.subjectAction as ActionEvt | undefined)}
							onJump={onJumpTo}
						/>
					)}
					<MessageAttachments
						attachments={action.attachments}
						subType={action.subType}
						idTag={auth?.idTag}
					/>
					{typeof action.content === 'string' && action.content.trim() ? (
						<RichText text={action.content} mentions allowAll={allowAll} />
					) : null}
				</VBox>
			)}
			{!deleted && reactions.length > 0 && (
				<HBox gap={1} className="mt-1" style={{ flexWrap: 'wrap' }}>
					{reactions.map((r) => (
						<Button
							key={r.key}
							size="sm"
							variant={ownReaction === r.key ? 'soft' : 'ghost'}
							aria-pressed={ownReaction === r.key}
							aria-label={`${getReactionLabel(t, r.key)}: ${r.count}`}
							disabled={!actionable}
							onClick={() => onReact(action.actionId, r.key)}
						>
							{`${r.emoji} ${r.count}`}
						</Button>
					))}
				</HBox>
			)}
			<HBox align="center" justify="end" gap={2} className="mt-1">
				{action.sendStatus === 'failed' && tempId && (
					<Button
						variant="ghost"
						color="error"
						size="sm"
						icon={<IcRetry />}
						onClick={() => onRetry(tempId)}
					>
						{t('Retry')}
					</Button>
				)}
				{!deleted && action.x?.editedAt && (
					<Text
						size="sm"
						emphasis="muted"
						title={dayjs.unix(action.x.editedAt).format('MMM D, HH:mm')}
					>
						{t('(edited)')}
					</Text>
				)}
				{showTimestamp && (
					<Text size="sm" emphasis="muted">
						{dayjs.unix(createdAtToSeconds(action.createdAt)).format('MMM D, HH:mm')}
					</Text>
				)}
				{action.sendStatus === 'sending' && <LoadingSpinner size="sm" />}
				{action.sendStatus === 'sent' && <Icon as={IcSent} size="sm" label={t('Sent')} />}
				{action.sendStatus === 'failed' && (
					<Icon as={IcError} size="sm" color="error" label={t('Failed to send')} />
				)}
			</HBox>
		</ChatBubble>
	)
}

export const MessageBubble = React.memo(MessageBubbleComponent)

// vim: ts=4
