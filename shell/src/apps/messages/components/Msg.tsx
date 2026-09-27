// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import {
	Button,
	ChatBubble,
	HBox,
	Icon,
	Image,
	Link,
	LoadingSpinner,
	ProfileCard,
	RichText,
	Text,
	useAuth,
	VBox
} from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTriangleAlert as IcFailed,
	LuRotateCw as IcRetry,
	LuCheck as IcSent
} from 'react-icons/lu'

import { useCtx } from '../../../context/index.js'
import { createdAtToSeconds } from '../../../read-position.js'
import { profilePath } from '../../../routes.js'
import type { ActionEvt } from '../types.js'

interface MsgProps {
	className?: string
	action: ActionEvt
	local?: boolean
	showSender?: boolean // Render the sender card (start of a visual group)
	showTimestamp?: boolean // Render the timestamp (start of a visual group)
	onRetry?: (tempId: string) => void
	register?: (node: Element | null) => (() => void) | undefined
}

function MsgComponent({
	className,
	action,
	local,
	showSender,
	showTimestamp,
	onRetry,
	register
}: MsgProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const urlContext = useCtx().base

	let imgSrc: string | undefined
	if (action.subType == 'IMG' && action.attachments?.[0] && auth?.idTag) {
		const att = action.attachments[0]
		if (typeof att !== 'string') {
			// Always use local instance with preferred variant
			imgSrc = getFileUrl(auth.idTag, att.fileId, 'vis.sd')
		}
	}

	const senderName = action.issuer.name || action.issuer.idTag
	const tempId = action.tempId

	return (
		<ChatBubble
			ref={register}
			side={local ? 'end' : 'start'}
			data-read-ts={createdAtToSeconds(action.createdAt)}
			className={className ? `mb-1 ${className}` : 'mb-1'}
		>
			{showSender && (
				<Link href={profilePath(urlContext, action.issuer.idTag)} className="mb-1">
					<ProfileCard profile={action.issuer} className="small" />
				</Link>
			)}
			<VBox>
				{imgSrc && (
					<Image src={imgSrc} alt={senderName || t('Image')} className="mb-2 mx-auto" />
				)}
				{typeof action.content == 'string' && action.content.trim() ? (
					<RichText text={action.content} />
				) : null}
			</VBox>
			<HBox align="center" justify="end" gap={2} className="mt-1">
				{action.sendStatus === 'failed' && onRetry && tempId && (
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
				{showTimestamp && (
					<Text size="sm" emphasis="muted">
						{dayjs.unix(createdAtToSeconds(action.createdAt)).format('MMM D, HH:mm')}
					</Text>
				)}
				{action.sendStatus === 'sending' && <LoadingSpinner size="sm" />}
				{action.sendStatus === 'sent' && <Icon as={IcSent} size="sm" label={t('Sent')} />}
				{action.sendStatus === 'failed' && (
					<Icon as={IcFailed} size="sm" color="error" label={t('Failed to send')} />
				)}
			</HBox>
		</ChatBubble>
	)
}

export const Msg = React.memo(MsgComponent)

// vim: ts=4
