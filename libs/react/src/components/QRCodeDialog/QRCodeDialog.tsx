// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import ReactQRCode from 'react-qr-code'

import { Dialog } from '../Dialog/Dialog.js'
import { resolveDefaultExport } from '../utils.js'

const QRCode = resolveDefaultExport(ReactQRCode)

export interface QRCodeDialogProps {
	/** The URL or text to encode as QR code. When undefined, the dialog is closed. */
	value: string | undefined
	/** Callback when the dialog is closed */
	onClose: () => void
}

/**
 * A minimal dialog that displays a QR code.
 * The dialog is open when `value` is a non-empty string, and closed when undefined.
 */
export function QRCodeDialog({ value, onClose }: QRCodeDialogProps) {
	if (!value) return null

	return (
		<Dialog open onClose={onClose}>
			<QRCode
				value={value}
				className="p-4 h-auto mx-auto"
				style={{ background: '#fff', width: '100%', maxWidth: 'min(100%,50vh)' }}
			/>
		</Dialog>
	)
}

// vim: ts=4
