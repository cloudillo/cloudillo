// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Card,
	HBox,
	ProfileCard,
	RichText,
	TimeFormat,
	useAuth,
	VBox
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useCtx } from '../../context/index.js'
import { profilePath } from '../../routes.js'
import { LiveDocCard } from './LiveDocCard.js'
import { parseLiveDocContent } from './live-doc.js'
import { Document, Images, Video } from './PostMedia.js'

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
	const urlContext = useCtx().base
	const contentRef = React.useRef<HTMLDivElement>(null)
	const [expanded, setExpanded] = React.useState(false)
	const [overflowing, setOverflowing] = React.useState(false)

	const fileIdTag = srcTag ?? subjectAction.issuer.idTag
	// A quoted `POST:LDOC` keeps its commentary in `content.text`; extending the
	// local rather than the render keeps the overflow measurement below correct.
	// Memoized: a fresh object every render would re-fire LiveDocCard's row fetch each time.
	const liveDoc = React.useMemo(
		() =>
			subjectAction.subType === 'LDOC'
				? parseLiveDocContent(subjectAction.content)
				: undefined,
		[subjectAction.subType, subjectAction.content]
	)
	const content = liveDoc
		? (liveDoc.text ?? '')
		: typeof subjectAction.content === 'string'
			? subjectAction.content
			: ''

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
		<Card variant="outline" padding={2} className={className}>
			<VBox gap={2}>
				<HBox align="center" gap={2}>
					<Link
						to={profilePath(urlContext, subjectAction.issuer.idTag)}
						className="flex-fill"
					>
						<ProfileCard profile={subjectAction.issuer} srcTag={fileIdTag} />
					</Link>
					<TimeFormat time={subjectAction.createdAt} />
				</HBox>
				<VBox
					ref={contentRef}
					className="pos-relative overflow-hidden"
					style={expanded ? undefined : { maxHeight: `${CLAMP_MAX_HEIGHT}px` }}
				>
					{!!content && <RichText text={content} />}
					{/* Never an iframe inside a quote inset. */}
					{liveDoc && <LiveDocCard docRef={liveDoc} width={width * 0.85} collapsedOnly />}
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
				</VBox>
				{overflowing && !expanded && (
					<Button
						variant="link"
						color="primary"
						size="sm"
						onClick={() => setExpanded(true)}
					>
						{t('Show more')}
					</Button>
				)}
			</VBox>
		</Card>
	)
}

// vim: ts=4
