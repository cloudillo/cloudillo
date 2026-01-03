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

/**
 * QR Code property editor section
 */

import * as React from 'react'
import * as Y from 'yjs'
import { PropertySection, PropertyField, Input, ColorInput } from '@cloudillo/react'

import type {
	YPrezilloDocument,
	PrezilloObject,
	ObjectId,
	QrCodeObject,
	QrErrorCorrection
} from '../../crdt'
import { updateObject } from '../../crdt'

export interface QRCodeSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
}

const ERROR_CORRECTION_OPTIONS: { value: QrErrorCorrection; label: string }[] = [
	{ value: 'low', label: 'Low (7%)' },
	{ value: 'medium', label: 'Medium (15%)' },
	{ value: 'quartile', label: 'Quartile (25%)' },
	{ value: 'high', label: 'High (30%)' }
]

export function QRCodeSection({ doc, yDoc, object }: QRCodeSectionProps) {
	// Only show for qrcode objects
	if (object.type !== 'qrcode') return null

	const qrObject = object as QrCodeObject

	// Local state for URL input - only sync to CRDT on blur
	const [localUrl, setLocalUrl] = React.useState(qrObject.url || '')

	// Refs to track pending changes for flush on unmount
	const pendingUrlRef = React.useRef<string | null>(null)
	const objectIdRef = React.useRef(object.id)
	objectIdRef.current = object.id

	// Flush pending URL change to CRDT
	const flushPendingUrl = React.useCallback(() => {
		if (pendingUrlRef.current !== null) {
			updateObject(yDoc, doc, objectIdRef.current as ObjectId, {
				url: pendingUrlRef.current
			})
			pendingUrlRef.current = null
		}
	}, [yDoc, doc])

	// Flush pending changes on unmount
	React.useEffect(() => {
		return () => {
			flushPendingUrl()
		}
	}, [flushPendingUrl])

	// Sync local state when external value changes (only if no pending edit)
	React.useEffect(() => {
		if (pendingUrlRef.current === null) {
			setLocalUrl(qrObject.url || '')
		}
	}, [qrObject.url])

	const handleUrlChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value
		setLocalUrl(value)
		pendingUrlRef.current = value
	}, [])

	const handleUrlBlur = React.useCallback(() => {
		flushPendingUrl()
	}, [flushPendingUrl])

	const handleErrorCorrectionChange = React.useCallback(
		(e: React.ChangeEvent<HTMLSelectElement>) => {
			updateObject(yDoc, doc, object.id as ObjectId, {
				errorCorrection: e.target.value as QrErrorCorrection
			})
		},
		[yDoc, doc, object.id]
	)

	const handleForegroundChange = React.useCallback(
		(color: string) => {
			updateObject(yDoc, doc, object.id as ObjectId, {
				foreground: color
			})
		},
		[yDoc, doc, object.id]
	)

	const handleBackgroundChange = React.useCallback(
		(color: string) => {
			updateObject(yDoc, doc, object.id as ObjectId, {
				background: color
			})
		},
		[yDoc, doc, object.id]
	)

	return (
		<PropertySection title="QR Code" defaultExpanded>
			<PropertyField label="URL" labelWidth={60}>
				<Input
					value={localUrl}
					onChange={handleUrlChange}
					onBlur={handleUrlBlur}
					placeholder="https://cloudillo.org"
					className="c-input--full"
				/>
			</PropertyField>

			<PropertyField label="Level" labelWidth={60}>
				<select
					value={qrObject.errorCorrection || 'medium'}
					onChange={handleErrorCorrectionChange}
					className="c-input c-input--full"
				>
					{ERROR_CORRECTION_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</PropertyField>

			<PropertyField label="FG" labelWidth={60}>
				<ColorInput
					value={qrObject.foreground || '#000000'}
					onChange={handleForegroundChange}
				/>
			</PropertyField>

			<PropertyField label="BG" labelWidth={60}>
				<ColorInput
					value={qrObject.background || '#ffffff'}
					onChange={handleBackgroundChange}
				/>
			</PropertyField>
		</PropertySection>
	)
}

// vim: ts=4
