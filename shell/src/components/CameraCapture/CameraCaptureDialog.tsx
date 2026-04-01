// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuX as IcClose,
	LuSwitchCamera as IcSwitch,
	LuZap as IcFlash,
	LuZapOff as IcFlashOff
} from 'react-icons/lu'

import { Button } from '@cloudillo/react'

import { PROTOCOL_VERSION } from '@cloudillo/core'
import type { OverlayItem } from '@cloudillo/core'

import {
	setCameraCaptureCallback,
	setCameraPreviewCallbacks,
	type CameraCaptureOpenOptions,
	type CameraCaptureResultData
} from '../../message-bus/handlers/camera.js'

import './camera-capture.css'

interface CaptureSession {
	options: CameraCaptureOpenOptions
	onResult: (result: CameraCaptureResultData | null) => void
}

export function CameraCaptureDialog() {
	const { t } = useTranslation()
	const videoRef = React.useRef<HTMLVideoElement>(null)
	const overlayCanvasRef = React.useRef<HTMLCanvasElement>(null)
	const offscreenCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
	const streamRef = React.useRef<MediaStream | null>(null)
	const previewIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
	const previewAppWindowRef = React.useRef<Window | null>(null)
	const previewSeqRef = React.useRef(0)
	const overlaysRef = React.useRef<OverlayItem[]>([])
	const [session, setSession] = React.useState<CaptureSession | null>(null)
	const [error, setError] = React.useState<string | null>(null)
	const [facingMode, setFacingMode] = React.useState<'user' | 'environment'>('environment')
	const [hasOverlay, setHasOverlay] = React.useState(false)
	const [torchEnabled, setTorchEnabled] = React.useState(false)
	const [torchAvailable, setTorchAvailable] = React.useState(false)

	// Register callbacks on mount
	React.useEffect(() => {
		setCameraCaptureCallback((options, onResult) => {
			setFacingMode(options.facing || 'environment')
			setSession({ options, onResult })
			setError(null)
			overlaysRef.current = []
			setHasOverlay(false)
		})

		setCameraPreviewCallbacks({
			onPreviewStart: (sessionId, appWindow, options) => {
				const width = options.width || 320
				const height = options.height || 240
				const fps = options.fps || 5

				// Create offscreen canvas for frame capture
				if (!offscreenCanvasRef.current) {
					offscreenCanvasRef.current = document.createElement('canvas')
				}
				offscreenCanvasRef.current.width = width
				offscreenCanvasRef.current.height = height

				previewAppWindowRef.current = appWindow
				previewSeqRef.current = 0

				// Stop previous interval if any
				if (previewIntervalRef.current) {
					clearInterval(previewIntervalRef.current)
				}

				previewIntervalRef.current = setInterval(() => {
					const video = videoRef.current
					const canvas = offscreenCanvasRef.current
					if (!video || !canvas || video.readyState < 2) return

					const ctx = canvas.getContext('2d')
					if (!ctx) return

					ctx.drawImage(video, 0, 0, width, height)
					const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
					const base64 = dataUrl.split(',')[1]
					const seq = ++previewSeqRef.current

					previewAppWindowRef.current?.postMessage(
						{
							cloudillo: true,
							v: PROTOCOL_VERSION,
							type: 'camera:preview.frame',
							payload: { sessionId, seq, imageData: base64, width, height }
						},
						'*'
					)
				}, 1000 / fps)
			},
			onPreviewStop: (_sessionId) => {
				if (previewIntervalRef.current) {
					clearInterval(previewIntervalRef.current)
					previewIntervalRef.current = null
				}
				previewAppWindowRef.current = null
			},
			onOverlay: (_sessionId, _frameSeq, overlays) => {
				overlaysRef.current = overlays
				setHasOverlay(overlays.length > 0)
				drawOverlay()
			}
		})

		return () => {
			setCameraCaptureCallback(null)
			setCameraPreviewCallbacks({
				onPreviewStart: null,
				onPreviewStop: null,
				onOverlay: null
			})
			if (previewIntervalRef.current) {
				clearInterval(previewIntervalRef.current)
			}
		}
	}, [])

	// Start camera when session opens
	React.useEffect(() => {
		if (!session || !videoRef.current) return

		let cancelled = false

		async function startCamera() {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode,
						width: { ideal: session!.options.maxResolution || 3000 },
						height: { ideal: session!.options.maxResolution || 3000 }
					},
					audio: false
				})

				if (cancelled) {
					stream.getTracks().forEach((t) => {
						t.stop()
					})
					return
				}

				streamRef.current = stream
				if (videoRef.current) {
					videoRef.current.srcObject = stream
				}

				// Detect torch capability
				const track = stream.getVideoTracks()[0]
				const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
					torch?: boolean
				}
				setTorchAvailable(!!capabilities?.torch)
				setTorchEnabled(false)
			} catch (err) {
				console.error('[CameraCapture] getUserMedia error:', err)
				if (!cancelled) {
					setError(t('Camera access denied'))
				}
			}
		}

		startCamera()

		return () => {
			cancelled = true
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((t) => {
					t.stop()
				})
				streamRef.current = null
			}
		}
	}, [session, facingMode])

	function drawOverlay() {
		const canvas = overlayCanvasRef.current
		const video = videoRef.current
		if (!canvas || !video) return

		// Match canvas size to its display size
		const rect = canvas.getBoundingClientRect()
		if (canvas.width !== rect.width || canvas.height !== rect.height) {
			canvas.width = rect.width
			canvas.height = rect.height
		}

		const ctx = canvas.getContext('2d')
		if (!ctx) return

		ctx.clearRect(0, 0, canvas.width, canvas.height)

		// Compute the video-to-canvas mapping (accounting for object-fit: contain)
		const videoAspect = video.videoWidth / video.videoHeight
		const canvasAspect = canvas.width / canvas.height
		let drawW: number, drawH: number, drawX: number, drawY: number

		if (videoAspect > canvasAspect) {
			// Video is wider → fit to width, letterbox top/bottom
			drawW = canvas.width
			drawH = drawW / videoAspect
			drawX = 0
			drawY = (canvas.height - drawH) / 2
		} else {
			// Video is taller → fit to height, pillarbox left/right
			drawH = canvas.height
			drawW = drawH * videoAspect
			drawX = (canvas.width - drawW) / 2
			drawY = 0
		}

		for (const item of overlaysRef.current) {
			if (!item.points || item.points.length === 0) continue

			const stroke = item.stroke || 'rgba(0, 255, 0, 0.8)'
			const fill = item.fill || 'rgba(0, 255, 0, 0.15)'
			const lineWidth = item.strokeWidth || 3

			ctx.strokeStyle = stroke
			ctx.fillStyle = fill
			ctx.lineWidth = lineWidth
			ctx.lineJoin = 'round'

			ctx.beginPath()
			for (let i = 0; i < item.points.length; i++) {
				const [nx, ny] = item.points[i]
				const x = drawX + nx * drawW
				const y = drawY + ny * drawH
				if (i === 0) ctx.moveTo(x, y)
				else ctx.lineTo(x, y)
			}

			if (item.type === 'polygon') {
				ctx.closePath()
				ctx.fill()
			}
			ctx.stroke()
		}
	}

	// Redraw overlay when video dimensions change
	React.useEffect(() => {
		if (!session || !hasOverlay) return

		const observer = new ResizeObserver(() => drawOverlay())
		if (overlayCanvasRef.current) {
			observer.observe(overlayCanvasRef.current)
		}
		return () => observer.disconnect()
	}, [session, hasOverlay])

	function handleCapture() {
		if (!videoRef.current || !session) return

		const video = videoRef.current
		const canvas = document.createElement('canvas')
		canvas.width = video.videoWidth
		canvas.height = video.videoHeight
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		ctx.drawImage(video, 0, 0)

		canvas.toBlob(
			(blob) => {
				if (!blob) {
					if (streamRef.current) {
						streamRef.current.getTracks().forEach((t) => {
							t.stop()
						})
						streamRef.current = null
					}
					session.onResult(null)
					setSession(null)
					return
				}

				const reader = new FileReader()
				reader.onload = () => {
					const dataUrl = reader.result as string
					// Strip the data:image/jpeg;base64, prefix
					const base64 = dataUrl.split(',')[1]

					// Clean up preview
					if (previewIntervalRef.current) {
						clearInterval(previewIntervalRef.current)
						previewIntervalRef.current = null
					}
					previewAppWindowRef.current = null
					overlaysRef.current = []
					setHasOverlay(false)

					// Clean up stream
					if (streamRef.current) {
						streamRef.current.getTracks().forEach((t) => {
							t.stop()
						})
						streamRef.current = null
					}

					session.onResult({
						imageData: base64,
						width: canvas.width,
						height: canvas.height
					})
					setSession(null)
				}
				reader.readAsDataURL(blob)
			},
			'image/jpeg',
			0.92
		)
	}

	function handleClose() {
		if (previewIntervalRef.current) {
			clearInterval(previewIntervalRef.current)
			previewIntervalRef.current = null
		}
		previewAppWindowRef.current = null
		overlaysRef.current = []
		setHasOverlay(false)

		if (streamRef.current) {
			streamRef.current.getTracks().forEach((t) => {
				t.stop()
			})
			streamRef.current = null
		}
		session?.onResult(null)
		setSession(null)
	}

	async function handleToggleTorch() {
		const track = streamRef.current?.getVideoTracks()[0]
		if (!track) return
		const newState = !torchEnabled
		await track.applyConstraints({ advanced: [{ torch: newState } as MediaTrackConstraintSet] })
		setTorchEnabled(newState)
	}

	function handleSwitchCamera() {
		// Stop current stream before switching
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((t) => {
				t.stop()
			})
			streamRef.current = null
		}
		setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))
	}

	if (!session) return null

	return (
		<div className="camera-capture-overlay">
			<div className="camera-capture-header">
				<h3>{t('Capture Photo')}</h3>
				<Button className="icon" onClick={handleClose}>
					<IcClose color="#fff" />
				</Button>
			</div>
			{error ? (
				<div className="camera-capture-error">
					<p>{error}</p>
				</div>
			) : (
				<>
					<video ref={videoRef} autoPlay playsInline muted />
					<canvas ref={overlayCanvasRef} className="camera-overlay-canvas" />
				</>
			)}
			<div className="camera-capture-controls">
				<button className="camera-switch-button" onClick={handleSwitchCamera}>
					<IcSwitch />
				</button>
				<button
					className="camera-capture-button"
					onClick={handleCapture}
					disabled={!!error}
				>
					<div className="camera-capture-button-inner" />
				</button>
				{torchAvailable ? (
					<button
						className={'camera-flash-button' + (torchEnabled ? ' active' : '')}
						onClick={handleToggleTorch}
					>
						{torchEnabled ? <IcFlash /> : <IcFlashOff />}
					</button>
				) : (
					<div style={{ width: 44 }} />
				)}
			</div>
		</div>
	)
}

// vim: ts=4
