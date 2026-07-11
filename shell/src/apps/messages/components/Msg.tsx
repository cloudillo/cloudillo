// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import {
	generateFragments,
	LoadingSpinner,
	mergeClasses,
	ProfileCard,
	useAuth
} from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTriangleAlert as IcFailed,
	LuRotateCw as IcRetry,
	LuCheck as IcSent
} from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { HOME_CONTEXT, useUrlContextIdTag } from '../../../context/index.js'
import { createdAtToSeconds } from '../../../read-position.js'
import type { ActionEvt } from '../types.js'

// Render message text: paragraphs split on blank lines, soft line breaks via
// `<br/>` placed only BETWEEN lines (not after the last) so there is no trailing
// blank line at the end of a paragraph.
function paragraphsFromContent(content: string): React.ReactNode {
	return content.split('\n\n').map((paragraph, i) => (
		<p key={i}>
			{paragraph.split('\n').map((line, j, arr) => (
				<React.Fragment key={j}>
					{generateFragments(line).map((n, k) => (
						<React.Fragment key={k}>{n}</React.Fragment>
					))}
					{j < arr.length - 1 && <br />}
				</React.Fragment>
			))}
		</p>
	))
}

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
	const urlContext = useUrlContextIdTag()

	let imgSrc: string | undefined
	if (action.subType == 'IMG' && action.attachments?.[0] && auth?.idTag) {
		const att = action.attachments[0]
		if (typeof att !== 'string') {
			// Always use local instance with preferred variant
			imgSrc = getFileUrl(auth.idTag, att.fileId, 'vis.sd')
		}
	}

	const senderName = action.issuer.name || action.issuer.idTag

	return (
		<div
			ref={register}
			data-read-ts={createdAtToSeconds(action.createdAt)}
			className={mergeClasses(
				'c-panel c-msg p-2 px-3 mb-1',
				local ? 'local primary' : 'remote secondary',
				className
			)}
		>
			{showSender && (
				<div className="c-panel-header d-flex mb-1">
					<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
						<ProfileCard profile={action.issuer} className="small" />
					</Link>
				</div>
			)}
			<div className="d-flex flex-column">
				{imgSrc && (
					<img
						src={imgSrc}
						alt={senderName || t('Image')}
						className="mb-2 mx-auto w-max-100"
					/>
				)}
				{typeof action.content == 'string' && action.content.trim()
					? paragraphsFromContent(action.content)
					: null}
			</div>
			<div className="c-hbox align-items-center g-2 justify-content-end text-muted text-small mt-1">
				{action.sendStatus === 'failed' && onRetry && action.tempId && (
					<button
						className="c-button link text-danger p-0"
						title={t('Retry')}
						aria-label={t('Retry')}
						onClick={() => onRetry(action.tempId!)}
					>
						<IcRetry size={14} className="me-1" />
						{t('Retry')}
					</button>
				)}
				{showTimestamp && (
					<span>
						{dayjs.unix(createdAtToSeconds(action.createdAt)).format('MMM D, HH:mm')}
					</span>
				)}
				{action.sendStatus === 'sending' && <LoadingSpinner size="sm" />}
				{action.sendStatus === 'sent' && <IcSent size={14} title={t('Sent')} />}
				{action.sendStatus === 'failed' && (
					<IcFailed size={14} className="text-danger" title={t('Failed to send')} />
				)}
			</div>
		</div>
	)
}

export const Msg = React.memo(MsgComponent)

// vim: ts=4
