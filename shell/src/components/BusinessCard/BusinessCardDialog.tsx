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
import ReactQRCode from 'react-qr-code'

import { LuX as IcClose, LuCopy as IcCopy, LuCheck as IcCheck } from 'react-icons/lu'

import { useAuth, ProfilePicture, IdentityTag, Button } from '@cloudillo/react'

import { buildCloudilloUri } from '../../utils/cloudillo-uri.js'

// Handle ESM/CJS interop
const QRCode = (ReactQRCode as any).default ?? ReactQRCode

export interface BusinessCardDialogProps {
	open: boolean
	onClose: () => void
}

export function BusinessCardDialog({ open, onClose }: BusinessCardDialogProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [copied, setCopied] = React.useState(false)

	if (!open || !auth?.idTag) return null

	const qrValue = buildCloudilloUri('id', auth.idTag)

	async function handleCopy() {
		if (!auth?.idTag) return
		try {
			await navigator.clipboard.writeText(auth.idTag)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Clipboard API not available
		}
	}

	return (
		<div className="c-modal show" tabIndex={-1} onClick={onClose}>
			<div
				className="c-dialog c-panel emph p-0"
				style={{ minWidth: '300px', maxWidth: '360px' }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="c-hbox g-2 p-3 border-bottom">
					<h3 className="m-0 flex-fill">{t('My Card')}</h3>
					<button type="button" className="c-link" aria-label="Close" onClick={onClose}>
						<IcClose />
					</button>
				</div>

				{/* Content */}
				<div className="c-vbox align-items-center p-4 g-3">
					<ProfilePicture profile={auth} />
					<h2 className="m-0">{auth.name}</h2>
					<IdentityTag className="text-secondary" idTag={auth.idTag} />

					<QRCode
						value={qrValue}
						className="p-3"
						style={{
							background: '#fff',
							width: '100%',
							maxWidth: '220px',
							height: 'auto',
							borderRadius: '8px'
						}}
					/>

					<Button className="secondary" onClick={handleCopy}>
						{copied ? <IcCheck /> : <IcCopy />}
						{copied ? t('Copied!') : t('Copy identity tag')}
					</Button>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
