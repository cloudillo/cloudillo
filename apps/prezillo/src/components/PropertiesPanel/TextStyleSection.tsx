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
import { PropertySection, PropertyField, NativeSelect } from '@cloudillo/react'
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

import type { YPrezilloDocument, PrezilloObject, ObjectId } from '../../crdt'
import { resolveTextStyle, updateObjectTextStyle } from '../../crdt'
import { FONT_SIZES } from '../../utils/text-styles'

// Bullet character options for list mode
const BULLET_OPTIONS = ['', '•', '◦', '▪', '▸', '→', '★', '✓', '✦', '❯', '○', '▹']

export interface TextStyleSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
}

export function TextStyleSection({ doc, yDoc, object }: TextStyleSectionProps) {
	const [showBulletPicker, setShowBulletPicker] = React.useState(false)

	// Get resolved text style
	const stored = doc.o.get(object.id)
	const resolvedStyle = stored ? resolveTextStyle(doc, stored) : null

	const handleBulletChange = React.useCallback(
		(bullet: string) => {
			updateObjectTextStyle(yDoc, doc, object.id as ObjectId, {
				lb: bullet || (null as any)
			})
			setShowBulletPicker(false)
		},
		[yDoc, doc, object.id]
	)

	const handleFontSizeChange = React.useCallback(
		(e: React.ChangeEvent<HTMLSelectElement>) => {
			const size = parseInt(e.target.value, 10)
			updateObjectTextStyle(yDoc, doc, object.id as ObjectId, { fs: size })
		},
		[yDoc, doc, object.id]
	)

	const handleTextAlignChange = React.useCallback(
		(align: 'left' | 'center' | 'right' | 'justify') => {
			const taMap = { left: 'l', center: 'c', right: 'r', justify: 'j' } as const
			updateObjectTextStyle(yDoc, doc, object.id as ObjectId, { ta: taMap[align] })
		},
		[yDoc, doc, object.id]
	)

	const handleVerticalAlignChange = React.useCallback(
		(align: 'top' | 'middle' | 'bottom') => {
			const vaMap = { top: 't', middle: 'm', bottom: 'b' } as const
			updateObjectTextStyle(yDoc, doc, object.id as ObjectId, { va: vaMap[align] })
		},
		[yDoc, doc, object.id]
	)

	if (!resolvedStyle) return null

	return (
		<PropertySection title="Text" defaultExpanded>
			{/* Font Size */}
			<PropertyField label="Size" labelWidth={40}>
				<NativeSelect
					value={resolvedStyle.fontSize}
					onChange={handleFontSizeChange}
					className="c-input--full"
				>
					{FONT_SIZES.map((size) => (
						<option key={size} value={size}>
							{size}px
						</option>
					))}
				</NativeSelect>
			</PropertyField>

			{/* Text Align */}
			<PropertyField label="Align" labelWidth={40}>
				<div className="c-hbox">
					<button
						className={mergeClasses(
							'c-button icon compact',
							resolvedStyle.textAlign === 'left' ? 'active' : ''
						)}
						onClick={() => handleTextAlignChange('left')}
						title="Align left"
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
					>
						<IcAlignJustify size={14} />
					</button>
				</div>
			</PropertyField>

			{/* Vertical Align */}
			<PropertyField label="V.Align" labelWidth={40}>
				<div className="c-hbox">
					<button
						className={mergeClasses(
							'c-button icon compact',
							resolvedStyle.verticalAlign === 'top' ? 'active' : ''
						)}
						onClick={() => handleVerticalAlignChange('top')}
						title="Align top"
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
					>
						<IcAlignBottom size={14} />
					</button>
				</div>
			</PropertyField>

			{/* List Bullet */}
			<PropertyField label="List" labelWidth={40}>
				<div style={{ position: 'relative' }}>
					<button
						className={mergeClasses(
							'c-button icon compact',
							resolvedStyle.listBullet ? 'active' : ''
						)}
						onClick={() => setShowBulletPicker(!showBulletPicker)}
						title="List bullet"
						style={{ minWidth: 32, fontSize: 16 }}
					>
						{resolvedStyle.listBullet || <IcListBullets size={14} />}
					</button>
					{showBulletPicker && (
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
			</PropertyField>
		</PropertySection>
	)
}

// vim: ts=4
