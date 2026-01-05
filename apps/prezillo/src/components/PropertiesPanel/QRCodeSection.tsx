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
import {
	updateObject,
	isInstance,
	isPropertyGroupLocked,
	unlockPropertyGroup,
	resetPropertyGroup
} from '../../crdt'
import { PropertyLockButton } from './PropertyLockButton'

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
	const objectId = object.id as ObjectId

	// Only show for qrcode objects
	if (object.type !== 'qrcode') return null

	const qrObject = object as QrCodeObject

	// Check if this object is an instance of a template prototype
	const objectIsInstance = isInstance(doc, objectId)

	// Check lock state for each property group
	const urlLocked = isPropertyGroupLocked(doc, objectId, 'qrUrl')
	const colorsLocked = isPropertyGroupLocked(doc, objectId, 'qrColors')
	const errorCorrectionLocked = isPropertyGroupLocked(doc, objectId, 'qrErrorCorrection')

	// Unlock/reset handlers
	const handleUnlockUrl = React.useCallback(() => {
		unlockPropertyGroup(yDoc, doc, objectId, 'qrUrl')
	}, [yDoc, doc, objectId])

	const handleResetUrl = React.useCallback(() => {
		resetPropertyGroup(yDoc, doc, objectId, 'qrUrl')
	}, [yDoc, doc, objectId])

	const handleUnlockColors = React.useCallback(() => {
		unlockPropertyGroup(yDoc, doc, objectId, 'qrColors')
	}, [yDoc, doc, objectId])

	const handleResetColors = React.useCallback(() => {
		resetPropertyGroup(yDoc, doc, objectId, 'qrColors')
	}, [yDoc, doc, objectId])

	const handleUnlockErrorCorrection = React.useCallback(() => {
		unlockPropertyGroup(yDoc, doc, objectId, 'qrErrorCorrection')
	}, [yDoc, doc, objectId])

	const handleResetErrorCorrection = React.useCallback(() => {
		resetPropertyGroup(yDoc, doc, objectId, 'qrErrorCorrection')
	}, [yDoc, doc, objectId])

	// Determine disabled states
	const urlDisabled = objectIsInstance && urlLocked
	const colorsDisabled = objectIsInstance && colorsLocked
	const errorCorrectionDisabled = objectIsInstance && errorCorrectionLocked

	// Local state for URL input - only sync to CRDT on blur
	const [localUrl, setLocalUrl] = React.useState(qrObject.url || '')

	// Refs to track pending changes for flush on unmount
	const pendingUrlRef = React.useRef<string | null>(null)
	const objectIdRef = React.useRef(object.id)
	objectIdRef.current = object.id

	// Flush pending URL change to CRDT
	const flushPendingUrl = React.useCallback(() => {
		if (pendingUrlRef.current !== null && !urlDisabled) {
			updateObject(yDoc, doc, objectIdRef.current as ObjectId, {
				url: pendingUrlRef.current
			})
			pendingUrlRef.current = null
		}
	}, [yDoc, doc, urlDisabled])

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

	const handleUrlChange = React.useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (urlDisabled) return
			const value = e.target.value
			setLocalUrl(value)
			pendingUrlRef.current = value
		},
		[urlDisabled]
	)

	const handleUrlBlur = React.useCallback(() => {
		flushPendingUrl()
	}, [flushPendingUrl])

	const handleErrorCorrectionChange = React.useCallback(
		(e: React.ChangeEvent<HTMLSelectElement>) => {
			if (errorCorrectionDisabled) return
			updateObject(yDoc, doc, objectId, {
				errorCorrection: e.target.value as QrErrorCorrection
			})
		},
		[yDoc, doc, objectId, errorCorrectionDisabled]
	)

	const handleForegroundChange = React.useCallback(
		(color: string) => {
			if (colorsDisabled) return
			updateObject(yDoc, doc, objectId, {
				foreground: color
			})
		},
		[yDoc, doc, objectId, colorsDisabled]
	)

	const handleBackgroundChange = React.useCallback(
		(color: string) => {
			if (colorsDisabled) return
			updateObject(yDoc, doc, objectId, {
				background: color
			})
		},
		[yDoc, doc, objectId, colorsDisabled]
	)

	return (
		<PropertySection title="QR Code" defaultExpanded>
			{/* URL with lock */}
			<div className="c-hbox ai-center mb-1">
				<span className="c-property-group-label flex-1">URL</span>
				<PropertyLockButton
					isInstance={objectIsInstance}
					isLocked={urlLocked}
					onUnlock={handleUnlockUrl}
					onReset={handleResetUrl}
				/>
			</div>
			<div className={urlDisabled ? 'c-property-field--locked mb-2' : 'mb-2'}>
				<Input
					value={localUrl}
					onChange={handleUrlChange}
					onBlur={handleUrlBlur}
					placeholder="https://cloudillo.org"
					className="c-input--full"
					disabled={urlDisabled}
				/>
			</div>

			{/* Error correction level with lock */}
			<div className="c-hbox ai-center mb-1">
				<span className="c-property-group-label flex-1">Level</span>
				<PropertyLockButton
					isInstance={objectIsInstance}
					isLocked={errorCorrectionLocked}
					onUnlock={handleUnlockErrorCorrection}
					onReset={handleResetErrorCorrection}
				/>
			</div>
			<div className={errorCorrectionDisabled ? 'c-property-field--locked mb-2' : 'mb-2'}>
				<select
					value={qrObject.errorCorrection || 'medium'}
					onChange={handleErrorCorrectionChange}
					className="c-input c-input--full"
					disabled={errorCorrectionDisabled}
				>
					{ERROR_CORRECTION_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</div>

			{/* Colors with lock */}
			<div className="c-hbox ai-center mb-1">
				<span className="c-property-group-label flex-1">Colors</span>
				<PropertyLockButton
					isInstance={objectIsInstance}
					isLocked={colorsLocked}
					onUnlock={handleUnlockColors}
					onReset={handleResetColors}
				/>
			</div>
			<div className={colorsDisabled ? 'c-property-field--locked' : ''}>
				<PropertyField label="FG" labelWidth={30}>
					<ColorInput
						value={qrObject.foreground || '#000000'}
						onChange={handleForegroundChange}
						disabled={colorsDisabled}
					/>
				</PropertyField>

				<PropertyField label="BG" labelWidth={30}>
					<ColorInput
						value={qrObject.background || '#ffffff'}
						onChange={handleBackgroundChange}
						disabled={colorsDisabled}
					/>
				</PropertyField>
			</div>
		</PropertySection>
	)
}

// vim: ts=4
