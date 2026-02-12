// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import QrScanner from 'qr-scanner'

import { LuX as IcClose } from 'react-icons/lu'

import { Button } from '@cloudillo/react'

import { parseCloudilloUri } from '../../utils/cloudillo-uri.js'
import { useQrScanner } from './state.js'

import './qr-scanner.css'

export interface QrScannerDialogProps {
	onScan: (idTag: string) => void
}

export function QrScannerDialog({ onScan }: QrScannerDialogProps) {
	const { t } = useTranslation()
	const [open, setOpen] = useQrScanner()
	const videoRef = React.useRef<HTMLVideoElement>(null)
	const scannerRef = React.useRef<QrScanner | null>(null)
	const [error, setError] = React.useState<string | null>(null)

	React.useEffect(
		function setupScanner() {
			if (!open || !videoRef.current) return

			setError(null)

			const scanner = new QrScanner(
				videoRef.current,
				(result: QrScanner.ScanResult) => {
					const uri = parseCloudilloUri(result.data)
					if (uri && uri.type === 'id') {
						scanner.stop()
						setOpen(false)
						onScan(uri.idTag)
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
		[open]
	)

	function handleClose() {
		setOpen(false)
	}

	if (!open) return null

	return (
		<div className="qr-scanner-overlay" onClick={handleClose}>
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
		</div>
	)
}

// vim: ts=4
