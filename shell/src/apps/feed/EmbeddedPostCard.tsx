// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, mergeClasses, ProfileCard, TimeFormat, useAuth } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { HOME_CONTEXT, useUrlContextIdTag } from '../../context/index.js'
import { Document, Images, renderPostContent, Video } from './PostMedia.js'

export interface EmbeddedPostCardProps {
	/** The hydrated original action being shared (REPOST subject). */
	subjectAction: ActionView
	/** Width budget of the outer panel; attachments render slightly inset. */
	width: number
	/** Source tenant the original's files live on (defaults to its issuer). */
	srcTag?: string
	className?: string
}

const CLAMP_MAX_HEIGHT = 24 * 16 // 24rem in px

/**
 * Read-only inset card rendering a reposted original. Used inside the feed when
 * an action is a REPOST, and inside ComposePanel for Quote mode. Carries no
 * interactive action row — all engagement happens on the outer repost wrapper.
 */
export function EmbeddedPostCard({
	subjectAction,
	width,
	srcTag,
	className
}: EmbeddedPostCardProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const urlContext = useUrlContextIdTag()
	const contentRef = React.useRef<HTMLDivElement>(null)
	const [expanded, setExpanded] = React.useState(false)
	const [overflowing, setOverflowing] = React.useState(false)

	const fileIdTag = srcTag ?? subjectAction.issuer.idTag
	const content = typeof subjectAction.content === 'string' ? subjectAction.content : ''

	React.useEffect(() => {
		const el = contentRef.current
		if (!el) return
		const check = () => setOverflowing(el.scrollHeight > CLAMP_MAX_HEIGHT + 8)
		check()
		const ro = new ResizeObserver(check)
		ro.observe(el)
		return () => ro.disconnect()
	}, [content, subjectAction.attachments])

	return (
		<div
			className={mergeClasses('c-panel p-2 g-2', className)}
			style={{
				border: '1px solid var(--col-container)',
				background: 'var(--col-surface)'
			}}
		>
			<div className="c-hbox align-items-center g-2">
				<Link
					to={`/profile/${urlContext || HOME_CONTEXT}/${subjectAction.issuer.idTag}`}
					className="flex-fill"
				>
					<ProfileCard profile={subjectAction.issuer} srcTag={fileIdTag} />
				</Link>
				<TimeFormat time={subjectAction.createdAt} />
			</div>
			<div
				ref={contentRef}
				className="pos-relative"
				style={
					expanded
						? undefined
						: { maxHeight: `${CLAMP_MAX_HEIGHT}px`, overflow: 'hidden' }
				}
			>
				{!!content && renderPostContent(content)}
				{!!subjectAction.attachments?.length &&
					(subjectAction.subType === 'VIDEO' ? (
						<Video attachments={subjectAction.attachments} idTag={fileIdTag} />
					) : subjectAction.subType === 'DOC' ? (
						<Document
							attachments={subjectAction.attachments}
							idTag={fileIdTag}
							token={auth?.token}
						/>
					) : (
						<Images
							width={width * 0.85}
							attachments={subjectAction.attachments}
							idTag={fileIdTag}
						/>
					))}
			</div>
			{overflowing && !expanded && (
				<Button
					kind="link"
					variant="primary"
					size="small"
					onClick={() => setExpanded(true)}
				>
					{t('Show more')}
				</Button>
			)}
		</div>
	)
}

// vim: ts=4
