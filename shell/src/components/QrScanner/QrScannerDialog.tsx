// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import QrScanner from 'qr-scanner'

import { LuX as IcClose } from 'react-icons/lu'

import { Button } from '@cloudillo/react'

import { parseCloudilloUri } from '../../utils/cloudillo-uri.js'
import { useQrScanner } from './state.js'
import { ApproveQrLoginView } from './ApproveQrLoginView.js'

import './qr-scanner.css'

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
		<div className="qr-scanner-overlay" onClick={handleClose}>
			{qrLoginData ? (
				<ApproveQrLoginView loginCode={qrLoginData.loginCode} onDone={handleClose} />
			) : (
				<>
					<div className="qr-scanner-header">
						<h3>{t('Scan QR Code')}</h3>
						<Button className="icon" onClick={handleClose}>
							<IcClose color="#fff" />
						</Button>
					</div>
					<video ref={videoRef} onClick={(e) => e.stopPropagation()} />
					<div className="qr-scanner-status">
						{error && <p className="text-error">{error}</p>}
					</div>
				</>
			)}
		</div>
	)
}

// vim: ts=4
