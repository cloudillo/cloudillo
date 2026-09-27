// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Presentational media helpers shared by the feed's first-class posts (feed.tsx
 * Post) and the reposted-original inset (EmbeddedPostCard). Kept as a leaf module
 * with no dependency back on feed.tsx so the import graph stays acyclic.
 */

import { getFileUrl, getOptimalVideoVariant } from '@cloudillo/core'
import { Badge, BadgeAnchor, Image, useRetriedImageUrl, VideoPlayer } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFileText as IcDocument } from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { ctxBase, viewPath } from '../../routes.js'

export { ImageMosaic as Images } from './ImageMosaic.js'

/////////////////////
// Video component //
/////////////////////
const PLAYABLE_VARIANTS = ['vid.xd', 'vid.hd', 'vid.md', 'vid.sd']
const POSTER_VARIANTS = ['vis.md', 'vis.sd', 'vis.tn']

export function hasPlayableVariant(variants: readonly string[] | undefined): boolean {
	if (!variants) return false
	return PLAYABLE_VARIANTS.some((v) => variants.includes(v))
}

function hasPosterVariant(variants: readonly string[] | undefined): boolean {
	if (!variants) return false
	return POSTER_VARIANTS.some((v) => variants.includes(v))
}

interface VideoProps {
	attachments: ActionView['attachments']
	idTag: string | undefined
}

export function Video({ attachments, idTag }: VideoProps) {
	const videoAtt = attachments?.[0]
	const variants = videoAtt?.localVariants
	const playable = hasPlayableVariant(variants)
	const hasPoster = hasPosterVariant(variants)

	const posterUrl =
		idTag && videoAtt && hasPoster
			? getFileUrl(idTag, videoAtt.fileId, getOptimalVideoVariant('preview', variants))
			: undefined

	const { activeSrc: activePoster } = useRetriedImageUrl(posterUrl)

	if (!idTag || !videoAtt) return null

	const aspect = videoAtt.dim ? `${videoAtt.dim[0]} / ${videoAtt.dim[1]}` : '16 / 9'

	return (
		<VideoPlayer
			processing={!playable}
			aspect={aspect}
			poster={activePoster}
			src={
				playable
					? getFileUrl(
							idTag,
							videoAtt.fileId,
							getOptimalVideoVariant('fullscreen', variants)
						)
					: undefined
			}
			className="w-100"
			style={{ maxHeight: '30rem' }}
		/>
	)
}

///////////////////////
// Document component //
///////////////////////
interface DocumentProps {
	attachments: ActionView['attachments']
	idTag: string | undefined
	token?: string
}

export function Document({ attachments, idTag, token }: DocumentProps) {
	const { t } = useTranslation()

	if (!idTag || !attachments?.length) return null

	const docAtt = attachments[0]
	const thumbnailUrl = getFileUrl(idTag, docAtt.fileId, 'vis.tn', { token })
	// Pinned to the issuer's own context: the document lives there, whatever the viewer is
	// currently browsing.
	const viewerPath = viewPath(ctxBase(idTag, undefined), `${idTag}:${docAtt.fileId}`)

	return (
		<Link to={viewerPath} className="d-inline-block">
			<BadgeAnchor
				position="bottom-end"
				badge={<Badge size="lg" icon={<IcDocument />} aria-hidden />}
			>
				<Image
					alt={t('Document preview')}
					src={thumbnailUrl}
					style={{ maxWidth: '100%', maxHeight: '30rem', minWidth: '12rem' }}
				/>
			</BadgeAnchor>
		</Link>
	)
}

// vim: ts=4
