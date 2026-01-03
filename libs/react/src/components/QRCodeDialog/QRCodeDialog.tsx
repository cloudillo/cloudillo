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
import ReactQRCode from 'react-qr-code'

import { Dialog } from '../Dialog/Dialog.js'

// Handle ESM/CJS interop - the module might be wrapped
const QRCode = (ReactQRCode as any).default ?? ReactQRCode

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
