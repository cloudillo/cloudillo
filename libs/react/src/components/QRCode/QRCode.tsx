// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import ReactQRCode from 'react-qr-code'

import { mergeClasses, resolveDefaultExport } from '../utils.js'

const QRCodeSvg = resolveDefaultExport(ReactQRCode)

export interface QRCodeProps {
	/** The URL or text to encode */
	value: string
	/** Maximum rendered width (CSS length or px). The code shrinks to fit narrower containers. Default: fills the container. */
	size?: number | string
	/** Accessible name. Without it the code is decorative (`aria-hidden`). */
	label?: string
	className?: string
}

/**
 * A QR code on a white quiet-zone tile, so it scans in dark mode too.
 */
export function QRCode({ value, size, label, className }: QRCodeProps) {
	return (
		<div
			className={mergeClasses('mx-auto p-3', className)}
			style={{ background: '#fff', borderRadius: 8, width: '100%', maxWidth: size }}
			{...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
		>
			<QRCodeSvg value={value} style={{ width: '100%', height: 'auto' }} />
		</div>
	)
}

// vim: ts=4
