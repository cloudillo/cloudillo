// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Progress, useApi, useToast } from '@cloudillo/react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { LuSquareDashed as IcBoxSelect, LuCircleDashed as IcCircleSelect } from 'react-icons/lu'
import ReactCrop, { type Crop } from 'react-image-crop'

export type Aspect = '4:1' | '3:1' | '2:1' | '16:9' | '3:2' | '4:3' | '1:1' | 'circle' | ''
const aspectMap = {
	// Aspect ratio = aspect / 36
	'4:1': 144,
	'3:1': 108,
	'2:1': 72,
	'16:9': 64,
	'3:2': 54,
	'4:3': 48,
	'1:1': 36,
	circle: 36,
	'': undefined
}

// Utility functions
export function getBestImageId(hashData: string, intent: 'orig' | 'hd' | 'sd' | 'tn') {
	// Handle plain file ID (no version prefix)
	if (!hashData.includes(':')) {
		return hashData
	}

	const [ver, hashesStr] = hashData.split(':')
	const hashes = hashesStr.split(',')

	if (intent == 'tn') {
		const idx =
			ver.indexOf('t') + 1 ||
			ver.indexOf('s') + 1 ||
			ver.indexOf('h') + 1 ||
			ver.indexOf('o') + 1
		if (idx) return hashes[idx - 1]
	}
	if (intent == 'hd') {
		const idx =
			ver.indexOf('h') + 1 ||
			ver.indexOf('o') + 1 ||
			ver.indexOf('s') + 1 ||
			ver.indexOf('t') + 1
		if (idx) return hashes[idx - 1]
	}
	if (intent == 'sd') {
		const idx =
			ver.indexOf('s') + 1 ||
			ver.indexOf('h') + 1 ||
			ver.indexOf('t') + 1 ||
			ver.indexOf('o') + 1
		if (idx) return hashes[idx - 1]
	}
}

export function ImageUpload({
	src,
	aspects,
	onSubmit,
	onCancel,
	onRetry,
	embedded,
	allowXd,
	isUploading,
	uploadProgress,
	uploadError,
	onAbort
}: {
	src: string
	aspects?: Aspect[]
	onSubmit: (blob: Blob) => void
	onCancel: () => void
	onRetry?: () => void
	embedded?: boolean // When true, renders without modal wrapper to fit inside a container
	allowXd?: boolean
	isUploading?: boolean
	uploadProgress?: number
	uploadError?: string
	onAbort?: () => void
}) {
	const { t } = useTranslation()
	const { api } = useApi()
	const { error: toastError } = useToast()
	const [aspect, setAspect] = React.useState<Aspect>() // Aspect ratio = aspect / 36
	const imgRef = React.useRef<HTMLImageElement>(null)
	const [crop, setCrop] = React.useState<Crop>()
	const [serverAllowsXd, setServerAllowsXd] = React.useState(false)
	const [xd, setXd] = React.useState(false)
	const [sourceLargeEnough, setSourceLargeEnough] = React.useState(false)
	const [phase, setPhase] = React.useState<'idle' | 'encoding' | 'submitting'>('idle')
	const encodingCancelledRef = React.useRef(false)
	const lastEncodedBlobRef = React.useRef<Blob | null>(null)

	React.useEffect(() => {
		if (!allowXd || !api) {
			setServerAllowsXd(false)
			return
		}
		let cancelled = false
		api.settings
			.get('file.max_generate_variant')
			.then((r) => {
				if (!cancelled) setServerAllowsXd(r?.value === 'xd')
			})
			.catch(() => {
				/* setting missing or perms denied — leave off */
			})
		return () => {
			cancelled = true
		}
	}, [allowXd, api])

	React.useEffect(() => {
		setXd(false)
		setSourceLargeEnough(false)
		lastEncodedBlobRef.current = null
		setPhase('idle')
	}, [src])

	React.useEffect(() => {
		if (!isUploading && !uploadError && phase === 'submitting') {
			setPhase('idle')
			lastEncodedBlobRef.current = null
		}
	}, [isUploading, uploadError, phase])

	function handleImageLoaded(_evt: React.SyntheticEvent<HTMLImageElement>) {
		const img = imgRef.current
		if (img) setSourceLargeEnough(Math.max(img.naturalWidth, img.naturalHeight) > 2560)
		// Use first aspect if available (check length, not value, since '' is valid for free)
		if (aspects?.length && aspects[0] !== '') changeAspect(aspects[0])
	}

	function changeCrop(newCrop: Crop, _percCrop: Crop) {
		//console.log('changeCrop', newCrop, percCrop)
		setCrop(newCrop)
	}

	function changeAspect(aspect: Aspect) {
		const newAspect = aspectMap[aspect]
		const img = imgRef.current
		if (!img) return
		const w = img.naturalWidth,
			h = img.naturalHeight
		const zoom = w / img.width
		if (!newAspect) return setAspect(undefined)
		const [width, height] =
			w / h <= newAspect / 36 ? [w, (w / newAspect) * 36] : [(h * newAspect) / 36, h]
		setCrop({
			x: (w - width) / 2 / zoom,
			y: (h - height) / 2 / zoom,
			width: width / zoom,
			height: height / zoom,
			unit: 'px'
		})
		setAspect(aspect)
	}

	async function handleSubmit() {
		encodingCancelledRef.current = false
		setPhase('encoding')
		try {
			const img = imgRef.current
			if (!img) {
				setPhase('idle')
				return
			}
			const zoom = img.naturalWidth / img.width
			const myCrop = crop ?? { x: 0, y: 0, width: img.width, height: img.height }

			const sx = myCrop.x * zoom
			const sy = myCrop.y * zoom
			const srcW = myCrop.width * zoom
			const srcH = myCrop.height * zoom

			const MAX = xd ? 3840 : 2560
			let dstW = srcW
			let dstH = srcH
			if (dstW > MAX || dstH > MAX) {
				const k = Math.min(MAX / dstW, MAX / dstH)
				dstW = Math.round(dstW * k)
				dstH = Math.round(dstH * k)
			}

			const canvas = document.createElement('canvas')
			canvas.width = dstW
			canvas.height = dstH
			const ctx = canvas.getContext('2d')!

			// Prefer native high-quality resampler (off-main-thread, Lanczos/cubic).
			let bitmap: ImageBitmap | null = null
			try {
				bitmap = await createImageBitmap(img, sx, sy, srcW, srcH, {
					resizeWidth: dstW,
					resizeHeight: dstH,
					resizeQuality: 'high'
				})
			} catch (err) {
				console.debug('createImageBitmap failed, falling back to drawImage', err)
			}
			if (encodingCancelledRef.current) {
				bitmap?.close()
				return
			}

			if (bitmap) {
				ctx.drawImage(bitmap, 0, 0)
				bitmap.close()
			} else {
				ctx.imageSmoothingEnabled = true
				ctx.imageSmoothingQuality = 'high'
				ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, dstW, dstH)
			}

			const blob =
				(await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, 'image/webp', 0.92)
				)) ??
				(await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, 'image/jpeg', 0.92)
				))
			if (encodingCancelledRef.current) return
			if (!blob) {
				console.error('image encode failed', { dstW, dstH })
				toastError(t('Failed to encode image. Try a smaller source.'))
				setPhase('idle')
				return
			}
			lastEncodedBlobRef.current = blob
			setPhase('submitting')
			onSubmit(blob)
		} catch (e) {
			console.error('image encode failed', e)
			toastError(t('Failed to encode image. Try a smaller source.'))
			setPhase('idle')
		}
	}

	function handleCancelEncoding() {
		encodingCancelledRef.current = true
		setPhase('idle')
	}

	function handleRetry() {
		if (onRetry) {
			onRetry()
			return
		}
		const cached = lastEncodedBlobRef.current
		if (cached) {
			setPhase('submitting')
			onSubmit(cached)
			return
		}
		handleSubmit()
	}

	const showOverlay = isUploading || !!uploadError || phase === 'encoding'
	const overlayStyle: React.CSSProperties | undefined = showOverlay ? { opacity: 0.6 } : undefined

	const cropArea = embedded ? (
		<div className="crop-image-wrapper" inert={showOverlay || undefined} style={overlayStyle}>
			<ReactCrop
				crop={crop}
				onChange={changeCrop}
				aspect={aspect ? aspectMap[aspect] / 36 : undefined}
				circularCrop={aspect == 'circle'}
			>
				<img ref={imgRef} src={src} onLoad={handleImageLoaded} />
			</ReactCrop>
		</div>
	) : (
		<div inert={showOverlay || undefined} style={overlayStyle}>
			<ReactCrop
				crop={crop}
				onChange={changeCrop}
				aspect={aspect ? aspectMap[aspect] / 36 : undefined}
				circularCrop={aspect == 'circle'}
			>
				<img
					ref={imgRef}
					src={src}
					onLoad={handleImageLoaded}
					style={{ maxWidth: '80vw', maxHeight: '80vh' }}
				/>
			</ReactCrop>
		</div>
	)

	const encodingToolbar = (
		<div className="crop-toolbar">
			<div className="c-hbox g-2 align-items-center flex-fill">
				<Progress indeterminate className="flex-fill" />
				<span className="text-sm">{t('Optimizing image...')}</span>
			</div>
			<div className="crop-toolbar-actions">
				<Button onClick={handleCancelEncoding}>{t('Cancel')}</Button>
			</div>
		</div>
	)

	const uploadingToolbar = (
		<div className="crop-toolbar">
			<div className="c-hbox g-2 align-items-center flex-fill">
				{uploadProgress === undefined ? (
					<Progress indeterminate className="flex-fill" />
				) : (
					<Progress value={uploadProgress} className="flex-fill" />
				)}
				<span className="text-sm">
					{t('Uploading...')}
					{uploadProgress !== undefined ? ` ${uploadProgress}%` : ''}
				</span>
			</div>
			<div className="crop-toolbar-actions">
				<Button onClick={onAbort}>{t('Cancel')}</Button>
			</div>
		</div>
	)

	const errorToolbar = (
		<div className="crop-toolbar">
			<div className="c-hbox g-2 align-items-center flex-fill">
				<span style={{ color: 'var(--col-error)' }}>{uploadError}</span>
			</div>
			<div className="crop-toolbar-actions">
				<Button onClick={onCancel}>{t('Cancel')}</Button>
				<Button variant="primary" onClick={handleRetry}>
					{t('Retry')}
				</Button>
			</div>
		</div>
	)

	const idleToolbar = (
		<div className="crop-toolbar">
			<div className="crop-toolbar-aspects">
				{aspects?.map((asp) => (
					<button
						key={asp}
						className={`crop-aspect-btn ${aspect === asp ? 'active' : ''}`}
						onClick={() => changeAspect(asp)}
						title={asp === 'circle' ? t('Circle') : asp || t('Free')}
					>
						{asp == 'circle' ? <IcCircleSelect /> : asp || <IcBoxSelect />}
					</button>
				))}
			</div>
			<div className="crop-toolbar-actions">
				{allowXd && serverAllowsXd && sourceLargeEnough && (
					<label className="c-hbox g-1" style={{ alignItems: 'center' }}>
						<input
							type="checkbox"
							className="c-toggle primary"
							checked={xd}
							onChange={(e) => setXd(e.target.checked)}
						/>
						{t('XD (4K)')}
					</label>
				)}
				<Button onClick={onCancel}>{t('Cancel')}</Button>
				<Button variant="primary" onClick={handleSubmit}>
					{t('Upload')}
				</Button>
			</div>
		</div>
	)

	const showEncoding = phase !== 'idle' && !isUploading && !uploadError
	const toolbar = showEncoding
		? encodingToolbar
		: isUploading
			? uploadingToolbar
			: uploadError
				? errorToolbar
				: idleToolbar

	if (embedded) {
		return (
			<div className="image-upload-embedded">
				{cropArea}
				{toolbar}
			</div>
		)
	}

	return (
		<div className="c-modal show">
			<div className="c-panel g-1">
				{cropArea}
				{toolbar}
			</div>
		</div>
	)
}

// vim: ts=4
