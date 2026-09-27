// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Feed image mosaic: one image full width, two side by side, three or
 * more as a tall left image beside a right column, with a lightbox. A shell domain
 * composite built on `Image`.
 */

import { getFileUrl, getOptimalImageVariant } from '@cloudillo/core'
import { Badge, BadgeAnchor, HBox, Image, VBox } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import 'react-photo-album/rows.css'

import { BLANK_IMAGE_SRC } from '../../utils.js'

type Attachment = NonNullable<ActionView['attachments']>[number]

const GAP = 8

function aspectOf(att: Attachment): number {
	return (att.dim?.[0] ?? 100) / (att.dim?.[1] ?? 100)
}

export interface ImageMosaicProps {
	width: number
	attachments: ActionView['attachments']
	idTag: string | undefined
}

export function ImageMosaic({ width, attachments, idTag }: ImageMosaicProps) {
	const { t } = useTranslation()
	const [lbIndex, setLbIndex] = React.useState<number | undefined>()

	// Lightbox: best available local variant for fullscreen
	const photos = React.useMemo(
		() =>
			idTag
				? attachments?.map((im) => ({
						// A refused fileId becomes a blank slide rather than a dropped one,
						// so `lbIndex` still indexes the attachments.
						src:
							getFileUrl(
								idTag,
								im.fileId,
								getOptimalImageVariant('fullscreen', im.localVariants)
							) ?? BLANK_IMAGE_SRC,
						width: im.dim?.[0] || 100,
						height: im.dim?.[1] || 100
					}))
				: undefined,
		[attachments, idTag]
	)

	if (!idTag || !attachments?.length) return null
	const [img1, img2, img3] = attachments

	// Inline images: always local, preferred variant for preview
	function tile(n: number, style: React.CSSProperties) {
		const att = attachments![n]
		return (
			<Image
				alt={t('Image {{n}}', { n: n + 1 })}
				className="cursor-pointer"
				onClick={() => setLbIndex(n)}
				src={getFileUrl(
					idTag!,
					att.fileId,
					getOptimalImageVariant('preview', att.localVariants)
				)}
				aspect={aspectOf(att)}
				style={{ margin: '0 auto', ...style }}
			/>
		)
	}

	let imgNode: React.ReactNode
	if (attachments.length === 1) {
		imgNode = tile(0, { maxWidth: '100%', maxHeight: '30rem' })
	} else if (attachments.length === 2) {
		const height = (width - GAP) / (aspectOf(img1) + aspectOf(img2))
		imgNode = (
			<HBox gap={2}>
				{tile(0, { height })}
				{tile(1, { height })}
			</HBox>
		)
	} else {
		// Adding the reciprocals of the aspect ratios of img2 and img3
		const aspect23 = 1 / (1 / aspectOf(img2) + 1 / aspectOf(img3))
		// Adding the aspect ratios of img1 and the right column (img2 and img3)
		const height = (width - GAP) / (aspectOf(img1) + aspect23)
		const width23 = (height - GAP) * aspect23
		const more = attachments.length - 3

		imgNode = (
			<HBox gap={2}>
				{tile(0, { height })}
				<VBox gap={2}>
					{tile(1, { width: width23 })}
					{more > 0 ? (
						<BadgeAnchor
							position="bottom-end"
							badge={<Badge size="lg">{`+${more}`}</Badge>}
						>
							{tile(2, { width: width23 })}
						</BadgeAnchor>
					) : (
						tile(2, { width: width23 })
					)}
				</VBox>
			</HBox>
		)
	}

	return (
		<>
			{imgNode}
			<Lightbox
				slides={photos}
				open={lbIndex !== undefined}
				index={lbIndex}
				close={() => setLbIndex(undefined)}
				plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
			/>
		</>
	)
}

// vim: ts=4
