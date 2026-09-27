// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Dialog,
	HBox,
	type ImageCropAspect,
	ImageCropper,
	type ImageCropRect,
	Progress,
	Text,
	Toggle,
	useApi,
	useToast,
	VBox
} from '@cloudillo/react'
import React from 'react'
import { useTranslation } from 'react-i18next'

export type Aspect = ImageCropAspect

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
	const imgRef = React.useRef<HTMLImageElement | null>(null)
	const cropRef = React.useRef<ImageCropRect | undefined>(undefined)
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

	function handleImageLoaded(img: HTMLImageElement) {
		imgRef.current = img
		setSourceLargeEnough(Math.max(img.naturalWidth, img.naturalHeight) > 2560)
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
			const myCrop = cropRef.current ?? { x: 0, y: 0, width: img.width, height: img.height }

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
	const showEncoding = phase !== 'idle' && !isUploading && !uploadError

	function progressStatus(label: string, value?: number) {
		return (
			<HBox gap={2} align="center" fill>
				<VBox fill>
					{value === undefined ? <Progress indeterminate /> : <Progress value={value} />}
				</VBox>
				<Text size="sm">{label}</Text>
			</HBox>
		)
	}

	const [status, actions] = showEncoding
		? [
				progressStatus(t('Optimizing image...')),
				<Button key="cancel" onClick={handleCancelEncoding}>
					{t('Cancel')}
				</Button>
			]
		: isUploading
			? [
					progressStatus(
						t('Uploading...') +
							(uploadProgress !== undefined ? ` ${uploadProgress}%` : ''),
						uploadProgress
					),
					<Button key="cancel" onClick={onAbort}>
						{t('Cancel')}
					</Button>
				]
			: uploadError
				? [
						<Text key="error" color="error" role="alert">
							{uploadError}
						</Text>,
						<>
							<Button onClick={onCancel}>{t('Cancel')}</Button>
							<Button color="primary" onClick={handleRetry}>
								{t('Retry')}
							</Button>
						</>
					]
				: [
						undefined,
						<>
							{allowXd && serverAllowsXd && sourceLargeEnough && (
								<Toggle
									color="primary"
									label={t('XD (4K)')}
									checked={xd}
									onChange={(e) => setXd(e.target.checked)}
								/>
							)}
							<Button onClick={onCancel}>{t('Cancel')}</Button>
							<Button color="primary" onClick={handleSubmit}>
								{t('Upload')}
							</Button>
						</>
					]

	const cropper = (
		<ImageCropper
			src={src}
			aspects={aspects}
			onImageLoad={handleImageLoaded}
			onCropChange={(crop) => {
				cropRef.current = crop
			}}
			disabled={showOverlay}
			status={status}
			actions={actions}
		/>
	)

	if (embedded) return cropper

	return (
		<Dialog open size="lg" title={t('Crop image')} dismissable={false}>
			{cropper}
		</Dialog>
	)
}

// vim: ts=4
