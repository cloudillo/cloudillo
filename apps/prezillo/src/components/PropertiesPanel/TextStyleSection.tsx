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
import * as Y from 'yjs'
import { PropertySection, PropertyField, NativeSelect, FontPicker } from '@cloudillo/react'
import { mergeClasses } from '../../utils'
import {
	PiTextAlignLeftBold as IcAlignLeft,
	PiTextAlignCenterBold as IcAlignCenter,
	PiTextAlignRightBold as IcAlignRight,
	PiTextAlignJustifyBold as IcAlignJustify,
	PiAlignTopBold as IcAlignTop,
	PiAlignCenterVerticalBold as IcAlignMiddle,
	PiAlignBottomBold as IcAlignBottom,
	PiListBulletsBold as IcListBullets
} from 'react-icons/pi'

import type { YPrezilloDocument, PrezilloObject, ObjectId, TextStyleField } from '../../crdt'
import {
	resolveTextStyle,
	updateObjectTextStyle,
	isInstance,
	isTextStyleFieldOverridden,
	unlockTextStyleField,
	resetTextStyleField
} from '../../crdt'
import { FONT_SIZES } from '../../utils/text-styles'
import { PropertyLockButton } from './PropertyLockButton'

// Bullet character options for list mode
const BULLET_OPTIONS = ['', '•', '◦', '▪', '▸', '→', '★', '✓', '✦', '❯', '○', '▹']

export interface TextStyleSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
}

export function TextStyleSection({ doc, yDoc, object }: TextStyleSectionProps) {
	const objectId = object.id as ObjectId
	const [showBulletPicker, setShowBulletPicker] = React.useState(false)

	// Check if this object is an instance of a template prototype
	const objectIsInstance = isInstance(doc, objectId)

	// Check per-field override state
	const isFontOverridden = isTextStyleFieldOverridden(doc, objectId, 'ff')
	const isSizeOverridden = isTextStyleFieldOverridden(doc, objectId, 'fs')
	const isAlignOverridden = isTextStyleFieldOverridden(doc, objectId, 'ta')
	const isVAlignOverridden = isTextStyleFieldOverridden(doc, objectId, 'va')
	const isBulletOverridden = isTextStyleFieldOverridden(doc, objectId, 'lb')

	// Per-field unlock/reset handlers
	const handleUnlockField = React.useCallback(
		(field: TextStyleField) => {
			unlockTextStyleField(yDoc, doc, objectId, field)
		},
		[yDoc, doc, objectId]
	)

	const handleResetField = React.useCallback(
		(field: TextStyleField) => {
			resetTextStyleField(yDoc, doc, objectId, field)
		},
		[yDoc, doc, objectId]
	)

	// Get resolved text style
	const stored = doc.o.get(object.id)
	const resolvedStyle = stored ? resolveTextStyle(doc, stored) : null

	const handleBulletChange = React.useCallback(
		(bullet: string) => {
			updateObjectTextStyle(yDoc, doc, objectId, {
				lb: bullet || (null as any)
			})
			setShowBulletPicker(false)
		},
		[yDoc, doc, objectId]
	)

	const handleFontFamilyChange = React.useCallback(
		(family: string) => {
			updateObjectTextStyle(yDoc, doc, objectId, { ff: family })
		},
		[yDoc, doc, objectId]
	)

	const handleFontSizeChange = React.useCallback(
		(e: React.ChangeEvent<HTMLSelectElement>) => {
			const size = parseInt(e.target.value, 10)
			updateObjectTextStyle(yDoc, doc, objectId, { fs: size })
		},
		[yDoc, doc, objectId]
	)

	const handleTextAlignChange = React.useCallback(
		(align: 'left' | 'center' | 'right' | 'justify') => {
			const taMap = { left: 'l', center: 'c', right: 'r', justify: 'j' } as const
			updateObjectTextStyle(yDoc, doc, objectId, { ta: taMap[align] })
		},
		[yDoc, doc, objectId]
	)

	const handleVerticalAlignChange = React.useCallback(
		(align: 'top' | 'middle' | 'bottom') => {
			const vaMap = { top: 't', middle: 'm', bottom: 'b' } as const
			updateObjectTextStyle(yDoc, doc, objectId, { va: vaMap[align] })
		},
		[yDoc, doc, objectId]
	)

	if (!resolvedStyle) return null

	// Determine field lock states for instances
	const fontLocked = objectIsInstance && !isFontOverridden
	const sizeLocked = objectIsInstance && !isSizeOverridden
	const alignLocked = objectIsInstance && !isAlignOverridden
	const vAlignLocked = objectIsInstance && !isVAlignOverridden
	const bulletLocked = objectIsInstance && !isBulletOverridden

	return (
		<PropertySection title="Text" defaultExpanded>
			{/* Font Family */}
			<PropertyField label="Font" labelWidth={40}>
				<div className="c-hbox ai-center g-1 f-1">
					<FontPicker
						value={resolvedStyle.fontFamily}
						onChange={handleFontFamilyChange}
						disabled={fontLocked}
					/>
					<PropertyLockButton
						isInstance={objectIsInstance}
						isLocked={fontLocked}
						onUnlock={() => handleUnlockField('ff')}
						onReset={() => handleResetField('ff')}
					/>
				</div>
			</PropertyField>

			{/* Font Size */}
			<PropertyField label="Size" labelWidth={40}>
				<div className="c-hbox ai-center g-1 f-1">
					<NativeSelect
						value={resolvedStyle.fontSize}
						onChange={handleFontSizeChange}
						className="c-input--full"
						disabled={sizeLocked}
					>
						{FONT_SIZES.map((size) => (
							<option key={size} value={size}>
								{size}px
							</option>
						))}
					</NativeSelect>
					<PropertyLockButton
						isInstance={objectIsInstance}
						isLocked={sizeLocked}
						onUnlock={() => handleUnlockField('fs')}
						onReset={() => handleResetField('fs')}
					/>
				</div>
			</PropertyField>

			{/* Text Align */}
			<PropertyField label="Align" labelWidth={40}>
				<div className="c-hbox ai-center g-1 f-1">
					<div className="c-hbox">
						<button
							className={mergeClasses(
								'c-button icon compact',
								resolvedStyle.textAlign === 'left' ? 'active' : ''
							)}
							onClick={() => handleTextAlignChange('left')}
							title="Align left"
							disabled={alignLocked}
						>
							<IcAlignLeft size={14} />
						</button>
						<button
							className={mergeClasses(
								'c-button icon compact',
								resolvedStyle.textAlign === 'center' ? 'active' : ''
							)}
							onClick={() => handleTextAlignChange('center')}
							title="Align center"
							disabled={alignLocked}
						>
							<IcAlignCenter size={14} />
						</button>
						<button
							className={mergeClasses(
								'c-button icon compact',
								resolvedStyle.textAlign === 'right' ? 'active' : ''
							)}
							onClick={() => handleTextAlignChange('right')}
							title="Align right"
							disabled={alignLocked}
						>
							<IcAlignRight size={14} />
						</button>
						<button
							className={mergeClasses(
								'c-button icon compact',
								resolvedStyle.textAlign === 'justify' ? 'active' : ''
							)}
							onClick={() => handleTextAlignChange('justify')}
							title="Justify"
							disabled={alignLocked}
						>
							<IcAlignJustify size={14} />
						</button>
					</div>
					<PropertyLockButton
						isInstance={objectIsInstance}
						isLocked={alignLocked}
						onUnlock={() => handleUnlockField('ta')}
						onReset={() => handleResetField('ta')}
					/>
				</div>
			</PropertyField>

			{/* Vertical Align */}
			<PropertyField label="V.Align" labelWidth={40}>
				<div className="c-hbox ai-center g-1 f-1">
					<div className="c-hbox">
						<button
							className={mergeClasses(
								'c-button icon compact',
								resolvedStyle.verticalAlign === 'top' ? 'active' : ''
							)}
							onClick={() => handleVerticalAlignChange('top')}
							title="Align top"
							disabled={vAlignLocked}
						>
							<IcAlignTop size={14} />
						</button>
						<button
							className={mergeClasses(
								'c-button icon compact',
								resolvedStyle.verticalAlign === 'middle' ? 'active' : ''
							)}
							onClick={() => handleVerticalAlignChange('middle')}
							title="Align middle"
							disabled={vAlignLocked}
						>
							<IcAlignMiddle size={14} />
						</button>
						<button
							className={mergeClasses(
								'c-button icon compact',
								resolvedStyle.verticalAlign === 'bottom' ? 'active' : ''
							)}
							onClick={() => handleVerticalAlignChange('bottom')}
							title="Align bottom"
							disabled={vAlignLocked}
						>
							<IcAlignBottom size={14} />
						</button>
					</div>
					<PropertyLockButton
						isInstance={objectIsInstance}
						isLocked={vAlignLocked}
						onUnlock={() => handleUnlockField('va')}
						onReset={() => handleResetField('va')}
					/>
				</div>
			</PropertyField>

			{/* List Bullet */}
			<PropertyField label="List" labelWidth={40}>
				<div className="c-hbox ai-center g-1 f-1">
					<div style={{ position: 'relative' }}>
						<button
							className={mergeClasses(
								'c-button icon compact',
								resolvedStyle.listBullet ? 'active' : ''
							)}
							onClick={() => !bulletLocked && setShowBulletPicker(!showBulletPicker)}
							title="List bullet"
							style={{ minWidth: 32, fontSize: 16 }}
							disabled={bulletLocked}
						>
							{resolvedStyle.listBullet || <IcListBullets size={14} />}
						</button>
						{showBulletPicker && !bulletLocked && (
							<div
								style={{
									position: 'absolute',
									top: '100%',
									left: 0,
									zIndex: 100,
									background: 'var(--bg-surface, #fff)',
									border: '1px solid var(--border, #ccc)',
									borderRadius: 4,
									padding: 4,
									display: 'grid',
									gridTemplateColumns: 'repeat(4, 1fr)',
									gap: 2,
									boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
								}}
							>
								{BULLET_OPTIONS.map((bullet, i) => (
									<button
										key={i}
										className={mergeClasses(
											'c-button icon compact',
											resolvedStyle.listBullet === bullet ? 'active' : ''
										)}
										onClick={() => handleBulletChange(bullet)}
										style={{
											width: 32,
											height: 32,
											fontSize: 18,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center'
										}}
										title={bullet || 'None'}
									>
										{bullet || '✕'}
									</button>
								))}
							</div>
						)}
					</div>
					<PropertyLockButton
						isInstance={objectIsInstance}
						isLocked={bulletLocked}
						onUnlock={() => handleUnlockField('lb')}
						onReset={() => handleResetField('lb')}
					/>
				</div>
			</PropertyField>
		</PropertySection>
	)
}

// vim: ts=4
