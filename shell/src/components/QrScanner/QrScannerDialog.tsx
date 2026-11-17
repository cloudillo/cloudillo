// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Alert, Button, HBox, IcClose, ImmersiveOverlay, Text, VBox } from '@cloudillo/react'
import QrScanner from 'qr-scanner'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { parseCloudilloUri } from '../../utils/cloudillo-uri.js'
import { ApprovePairView } from './ApprovePairView.js'
import { ApproveQrLoginView } from './ApproveQrLoginView.js'
import { isQrNativeOff, useQrScanner } from './state.js'

export interface QrScannerDialogProps {
	onScan: (idTag: string) => void
}

interface QrLoginData {
	loginCode: string
}

// Same test as qr-scanner: Android WebView exposes BarcodeDetector without a backend
// (no qr_code in getSupportedFormats), which must count as "no native detector"
type NativeBD = { getSupportedFormats?: () => Promise<string[]> }
const nativeQrDetector: Promise<boolean> = (async () => {
	try {
		// Inside the try: a module-level read must not reject unhandled where there is no window (node tests)
		const BD = (window as unknown as { BarcodeDetector?: NativeBD }).BarcodeDetector
		return !!BD?.getSupportedFormats && (await BD.getSupportedFormats()).includes('qr_code')
	} catch {
		return false
	}
})()

// WebView camera streams often don't autofocus; ask for continuous AF when the camera offers it
async function enableContinuousFocus(video: HTMLVideoElement) {
	const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0]
	const caps = track?.getCapabilities?.() as { focusMode?: string[] } | undefined
	if (!track || !caps?.focusMode?.includes('continuous')) return
	await track.applyConstraints({
		advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet]
	})
}

export function QrScannerDialog({ onScan }: QrScannerDialogProps) {
	const { t } = useTranslation()
	const [open, setOpen] = useQrScanner()
	const videoRef = React.useRef<HTMLVideoElement>(null)
	const scannerRef = React.useRef<QrScanner | null>(null)
	const [error, setError] = React.useState<string | null>(null)
	const [qrLoginData, setQrLoginData] = React.useState<QrLoginData | null>(null)
	const [pairData, setPairData] = React.useState<{ sessionId: string; code?: string } | null>(
		null
	)
	const approving = !!qrLoginData || !!pairData

	React.useEffect(
		function setupScanner() {
			if (!open || !videoRef.current || approving) return

			setError(null)

			let cancelled = false
			let scanner: QrScanner | undefined

			;(async () => {
				// qr-scanner picks its engine at construction: set the flag before it, on every open,
				// so the setting applies without a reload
				const native = !isQrNativeOff() && (await nativeQrDetector)
				if (cancelled) return
				;(
					QrScanner as unknown as { _disableBarcodeDetector: boolean }
				)._disableBarcodeDetector = !native
				console.info('QR engine:', native ? 'native' : 'qr-scanner JS worker')
				if (!videoRef.current) return

				const s = new QrScanner(
					videoRef.current,
					(result: QrScanner.ScanResult) => {
						const uri = parseCloudilloUri(result.data)
						if (uri && uri.type === 'id') {
							s.stop()
							setOpen(false)
							onScan(uri.idTag)
						} else if (uri && uri.type === 'qr-login') {
							s.stop()
							setQrLoginData({
								loginCode: uri.loginCode
							})
						} else if (uri && uri.type === 'qr-pair') {
							s.stop()
							setPairData({ sessionId: uri.sessionId, code: uri.code })
						} else {
							setError(t('Not a Cloudillo QR code'))
						}
					},
					{
						preferredCamera: 'environment',
						highlightScanRegion: true,
						highlightCodeOutline: true,
						returnDetailedScanResult: true,
						// Native detector is cheap; the JS fallback pays a canvas readback per scan
						maxScansPerSecond: native ? 25 : 10,
						onDecodeError: (err) => {
							// Silence the per-frame "no QR found"; anything else is a real engine failure
							if (err !== QrScanner.NO_QR_CODE_FOUND)
								console.warn('QR decode error:', err)
						}
					}
				)
				scanner = s
				scannerRef.current = s

				try {
					await s.start()
				} catch (err) {
					console.error('QR scanner start failed:', err)
					if (!cancelled) setError(t('Camera access denied'))
					return
				}
				if (cancelled) return
				enableContinuousFocus(s.$video).catch((err) =>
					console.warn('focusMode not applied', err)
				)
			})()

			return function cleanup() {
				cancelled = true
				scanner?.destroy()
				scannerRef.current = null
			}
		},
		[open, approving]
	)

	function handleClose() {
		setQrLoginData(null)
		setPairData(null)
		setOpen(false)
	}

	if (!open) return null

	return (
		<ImmersiveOverlay
			open
			onClose={handleClose}
			aria-label={t('Scan QR Code')}
			controls={
				!approving && (
					<HBox align="center" justify="between" className="w-100">
						<Text>{t('Scan QR Code')}</Text>
						<Button onClick={handleClose} icon={<IcClose />} aria-label={t('Close')} />
					</HBox>
				)
			}
		>
			{pairData ? (
				<ApprovePairView
					sessionId={pairData.sessionId}
					code={pairData.code}
					onDone={handleClose}
				/>
			) : qrLoginData ? (
				<ApproveQrLoginView loginCode={qrLoginData.loginCode} onDone={handleClose} />
			) : (
				<VBox align="center" gap={3} padding={3} className="w-100">
					{/* Media surface: driven by the qr-scanner lib */}
					<video
						ref={videoRef}
						style={{
							width: '100%',
							maxWidth: 480,
							maxHeight: '60vh',
							borderRadius: 12,
							objectFit: 'cover'
						}}
					/>
					{error && (
						<Alert color="error" inverse compact>
							{error}
						</Alert>
					)}
				</VBox>
			)}
		</ImmersiveOverlay>
	)
}

// vim: ts=4
