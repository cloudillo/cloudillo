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

function aspectOf(att: Attachment): number {
	return (att.dim?.[0] ?? 100) / (att.dim?.[1] ?? 100)
}

export interface ImageMosaicProps {
	attachments: ActionView['attachments']
	idTag: string | undefined
}

export function ImageMosaic({ attachments, idTag }: ImageMosaicProps) {
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

	// Intrinsic layout, no measured width: flex-grow proportional to the aspect
	// ratio gives every tile in a row the same height, and `min-width: 0` keeps the
	// row inside its card.
	function grow(aspect: number): React.CSSProperties {
		return { flex: `${aspect} 1 0`, minWidth: 0 }
	}

	let imgNode: React.ReactNode
	if (attachments.length === 1) {
		imgNode = tile(0, { maxWidth: '100%', maxHeight: '30rem' })
	} else if (attachments.length === 2) {
		imgNode = (
			<HBox gap={2}>
				{tile(0, grow(aspectOf(img1)))}
				{tile(1, grow(aspectOf(img2)))}
			</HBox>
		)
	} else {
		// The right column (img2 over img3) behaves like one tile of this aspect ratio
		const aspect23 = 1 / (1 / aspectOf(img2) + 1 / aspectOf(img3))
		const more = attachments.length - 3

		// The column is one gap taller than the pure ratio, so the left tile
		// stretches to the row and crops that gap away.
		imgNode = (
			<HBox gap={2}>
				{tile(0, { ...grow(aspectOf(img1)), alignSelf: 'stretch', objectFit: 'cover' })}
				<VBox gap={2} style={grow(aspect23)}>
					{tile(1, { width: '100%' })}
					{more > 0 ? (
						<BadgeAnchor
							position="bottom-end"
							badge={<Badge size="lg">{`+${more}`}</Badge>}
						>
							{tile(2, { width: '100%' })}
						</BadgeAnchor>
					) : (
						tile(2, { width: '100%' })
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
