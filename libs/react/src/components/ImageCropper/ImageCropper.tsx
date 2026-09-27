// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuSquareDashed as IcBoxSelect, LuCircleDashed as IcCircleSelect } from 'react-icons/lu'
import ReactCrop, { type Crop } from 'react-image-crop'

import { useLibTranslation } from '../../i18n.js'
import { Segmented, SegmentedItem } from '../Segmented/index.js'
import { Toolbar, ToolbarSpacer } from '../Toolbar/index.js'
import { mergeClasses } from '../utils.js'

/** Aspect preset; `''` is free-form, `circle` is 1:1 with a round mask. */
export type ImageCropAspect = '4:1' | '3:1' | '2:1' | '16:9' | '3:2' | '4:3' | '1:1' | 'circle' | ''

/** Crop rectangle in displayed-image pixels (scale by `naturalWidth / width` for source pixels). */
export interface ImageCropRect {
	x: number
	y: number
	width: number
	height: number
}

export interface ImageCropperProps {
	src: string
	/** Presets offered in the toolbar; the first non-free one is applied on load. */
	aspects?: ImageCropAspect[]
	onCropChange?: (crop: ImageCropRect | undefined) => void
	/** Fires with the `<img>` once it has loaded (natural size, encode source). */
	onImageLoad?: (img: HTMLImageElement) => void
	/** Dims the image and blocks interaction (encoding, uploading). */
	disabled?: boolean
	/** Replaces the aspect presets on the left of the toolbar (status rows). */
	status?: React.ReactNode
	/** Trailing toolbar content, usually the Cancel / Upload buttons. */
	actions?: React.ReactNode
	className?: string
}

const ASPECT_RATIO: Record<ImageCropAspect, number | undefined> = {
	'4:1': 4,
	'3:1': 3,
	'2:1': 2,
	'16:9': 16 / 9,
	'3:2': 3 / 2,
	'4:3': 4 / 3,
	'1:1': 1,
	circle: 1,
	'': undefined
}

/** ReactCrop with an aspect-preset toolbar. The caller encodes from `onImageLoad` + `onCropChange`. */
export function ImageCropper({
	src,
	aspects,
	onCropChange,
	onImageLoad,
	disabled,
	status,
	actions,
	className
}: ImageCropperProps) {
	const { t } = useLibTranslation()
	const imgRef = React.useRef<HTMLImageElement>(null)
	const [aspect, setAspect] = React.useState<ImageCropAspect>('')
	const [crop, setCrop] = React.useState<Crop>()

	function applyCrop(next: Crop | undefined) {
		setCrop(next)
		onCropChange?.(next && { x: next.x, y: next.y, width: next.width, height: next.height })
	}

	function changeAspect(next: ImageCropAspect) {
		const img = imgRef.current
		if (!img) return
		setAspect(next)
		const ratio = ASPECT_RATIO[next]
		if (!ratio) return
		// Largest centred box of that ratio, in displayed pixels
		const w = img.width
		const h = img.height
		const [width, height] = w / h <= ratio ? [w, w / ratio] : [h * ratio, h]
		applyCrop({ x: (w - width) / 2, y: (h - height) / 2, width, height, unit: 'px' })
	}

	function handleLoad() {
		const img = imgRef.current
		if (!img) return
		// Reset here, not in an effect on `src`: an effect can land after a cached image's
		// onLoad and wipe the preset below.
		// the old crop box stays drawn until the new image loads; key the <img> by src if that matters
		setAspect('')
		applyCrop(undefined)
		onImageLoad?.(img)
		// Check length, not value: '' (free) is a valid first preset
		if (aspects?.length && aspects[0] !== '') changeAspect(aspects[0])
	}

	const ratio = ASPECT_RATIO[aspect]

	return (
		<div className={mergeClasses('c-image-cropper', className)}>
			<div
				className="c-image-cropper-area"
				inert={disabled || undefined}
				aria-busy={disabled || undefined}
			>
				<ReactCrop
					crop={crop}
					onChange={applyCrop}
					aspect={ratio}
					circularCrop={aspect === 'circle'}
				>
					{/* ds-allow: third-party react-image-crop — ReactCrop needs a raw <img> child */}
					<img ref={imgRef} src={src} alt="" onLoad={handleLoad} />
				</ReactCrop>
			</div>
			<Toolbar>
				{status ??
					(!!aspects?.length && (
						<Segmented
							value={aspect}
							onChange={(v) => changeAspect(v as ImageCropAspect)}
						>
							{aspects.map((asp) =>
								asp === 'circle' ? (
									<SegmentedItem
										key={asp}
										value={asp}
										icon={IcCircleSelect}
										label={t('Circle')}
									/>
								) : asp === '' ? (
									<SegmentedItem
										key="free"
										value=""
										icon={IcBoxSelect}
										label={t('Free')}
									/>
								) : (
									<SegmentedItem key={asp} value={asp}>
										{asp}
									</SegmentedItem>
								)
							)}
						</Segmented>
					))}
				<ToolbarSpacer />
				{actions}
			</Toolbar>
		</div>
	)
}

// vim: ts=4
