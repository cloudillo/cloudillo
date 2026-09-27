// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Alert, Button, HBox, ImmersiveOverlay, Text, VBox } from '@cloudillo/react'
import QrScanner from 'qr-scanner'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

import { parseCloudilloUri } from '../../utils/cloudillo-uri.js'
import { ApproveQrLoginView } from './ApproveQrLoginView.js'
import { useQrScanner } from './state.js'

export interface QrScannerDialogProps {
	onScan: (idTag: string) => void
}

interface QrLoginData {
	loginCode: string
}

export function QrScannerDialog({ onScan }: QrScannerDialogProps) {
	const { t } = useTranslation()
	const [open, setOpen] = useQrScanner()
	const videoRef = React.useRef<HTMLVideoElement>(null)
	const scannerRef = React.useRef<QrScanner | null>(null)
	const [error, setError] = React.useState<string | null>(null)
	const [qrLoginData, setQrLoginData] = React.useState<QrLoginData | null>(null)

	React.useEffect(
		function setupScanner() {
			if (!open || !videoRef.current || qrLoginData) return

			setError(null)

			const scanner = new QrScanner(
				videoRef.current,
				(result: QrScanner.ScanResult) => {
					console.log('QR scanned:', result.data)
					const uri = parseCloudilloUri(result.data)
					console.log('Parsed URI:', uri)
					if (uri && uri.type === 'id') {
						scanner.stop()
						setOpen(false)
						onScan(uri.idTag)
					} else if (uri && uri.type === 'qr-login') {
						scanner.stop()
						setQrLoginData({
							loginCode: uri.loginCode
						})
					} else {
						setError(t('Not a Cloudillo QR code'))
					}
				},
				{
					preferredCamera: 'environment',
					highlightScanRegion: true,
					highlightCodeOutline: true,
					returnDetailedScanResult: true,
					onDecodeError: () => {
						// Silence continuous "no QR found" errors
					}
				}
			)

			scannerRef.current = scanner

			scanner.start().catch((err: Error) => {
				console.error('QR scanner start failed:', err)
				setError(t('Camera access denied'))
			})

			return function cleanup() {
				scanner.destroy()
				scannerRef.current = null
			}
		},
		[open, qrLoginData]
	)

	function handleClose() {
		setQrLoginData(null)
		setOpen(false)
	}

	if (!open) return null

	return (
		<ImmersiveOverlay
			open
			onClose={handleClose}
			aria-label={t('Scan QR Code')}
			controls={
				!qrLoginData && (
					<HBox align="center" justify="between" className="w-100">
						<Text>{t('Scan QR Code')}</Text>
						<Button onClick={handleClose} icon={<IcClose />} aria-label={t('Close')} />
					</HBox>
				)
			}
		>
			{qrLoginData ? (
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
