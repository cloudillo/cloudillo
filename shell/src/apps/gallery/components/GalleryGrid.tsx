// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { RowsPhotoAlbum, MasonryPhotoAlbum } from 'react-photo-album'
import 'react-photo-album/rows.css'
import 'react-photo-album/masonry.css'

import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/plugins/thumbnails.css'

import type { GalleryLayout } from '../types.js'

export interface PhotoItem {
	src: string
	fullSrc?: string // High-res version for lightbox
	width: number
	height: number
	title?: string
}

interface GalleryGridProps {
	photos: PhotoItem[]
	layout: GalleryLayout
	className?: string
}

export function GalleryGrid({ photos, layout, className }: GalleryGridProps) {
	const [lbIndex, setLbIndex] = React.useState<number | undefined>()

	const handleClick = React.useCallback(({ index }: { index: number }) => setLbIndex(index), [])

	// Create lightbox slides with high-res images
	const lightboxSlides = React.useMemo(
		() => photos.map((p) => ({ src: p.fullSrc || p.src, title: p.title })),
		[photos]
	)

	const PhotoAlbumComponent = layout === 'masonry' ? MasonryPhotoAlbum : RowsPhotoAlbum

	return (
		<div className={className}>
			<PhotoAlbumComponent
				photos={photos}
				onClick={handleClick}
				{...(layout === 'masonry'
					? { columns: (containerWidth) => Math.max(2, Math.floor(containerWidth / 250)) }
					: {})}
			/>
			<Lightbox
				slides={lightboxSlides}
				open={lbIndex !== undefined}
				index={lbIndex}
				close={() => setLbIndex(undefined)}
				plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
			/>
		</div>
	)
}

// vim: ts=4
