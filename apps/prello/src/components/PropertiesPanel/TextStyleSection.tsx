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
	PiAlignBottomBold as IcAlignBottom
} from 'react-icons/pi'

import type { YPrelloDocument, PrelloObject, ObjectId } from '../../crdt'
import { resolveTextStyle, updateObjectTextStyle } from '../../crdt'
import { FONT_SIZES } from '../../utils/text-styles'

export interface TextStyleSectionProps {
	doc: YPrelloDocument
	yDoc: Y.Doc
	object: PrelloObject
}

export function TextStyleSection({ doc, yDoc, object }: TextStyleSectionProps) {
	// Get resolved text style
	const stored = doc.o.get(object.id)
	const resolvedStyle = stored ? resolveTextStyle(doc, stored) : null

	const handleFontSizeChange = React.useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
		const size = parseInt(e.target.value, 10)
		updateObjectTextStyle(yDoc, doc, object.id as ObjectId, { fs: size })
	}, [yDoc, doc, object.id])

	const handleTextAlignChange = React.useCallback((align: 'left' | 'center' | 'right' | 'justify') => {
		const taMap = { 'left': 'l', 'center': 'c', 'right': 'r', 'justify': 'j' } as const
		updateObjectTextStyle(yDoc, doc, object.id as ObjectId, { ta: taMap[align] })
	}, [yDoc, doc, object.id])

	const handleVerticalAlignChange = React.useCallback((align: 'top' | 'middle' | 'bottom') => {
		const vaMap = { 'top': 't', 'middle': 'm', 'bottom': 'b' } as const
		updateObjectTextStyle(yDoc, doc, object.id as ObjectId, { va: vaMap[align] })
	}, [yDoc, doc, object.id])

	if (!resolvedStyle) return null

	return (
		<PropertySection title="Text" defaultExpanded>
			{/* Font Size */}
			<PropertyField label="Size" labelWidth={40}>
				<NativeSelect
					value={resolvedStyle.fontSize}
					onChange={handleFontSizeChange}
					style={{ width: '100%' }}
				>
					{FONT_SIZES.map(size => (
						<option key={size} value={size}>{size}px</option>
					))}
				</NativeSelect>
			</PropertyField>

			{/* Text Align */}
			<PropertyField label="Align" labelWidth={40}>
				<div className="c-hbox">
					<button
						className={mergeClasses('c-button icon', resolvedStyle.textAlign === 'left' ? 'active' : '')}
						onClick={() => handleTextAlignChange('left')}
						title="Align left"
						style={{ padding: '4px' }}
					>
						<IcAlignLeft size={14} />
					</button>
					<button
						className={mergeClasses('c-button icon', resolvedStyle.textAlign === 'center' ? 'active' : '')}
						onClick={() => handleTextAlignChange('center')}
						title="Align center"
						style={{ padding: '4px' }}
					>
						<IcAlignCenter size={14} />
					</button>
					<button
						className={mergeClasses('c-button icon', resolvedStyle.textAlign === 'right' ? 'active' : '')}
						onClick={() => handleTextAlignChange('right')}
						title="Align right"
						style={{ padding: '4px' }}
					>
						<IcAlignRight size={14} />
					</button>
					<button
						className={mergeClasses('c-button icon', resolvedStyle.textAlign === 'justify' ? 'active' : '')}
						onClick={() => handleTextAlignChange('justify')}
						title="Justify"
						style={{ padding: '4px' }}
					>
						<IcAlignJustify size={14} />
					</button>
				</div>
			</PropertyField>

			{/* Vertical Align */}
			<PropertyField label="V.Align" labelWidth={40}>
				<div className="c-hbox">
					<button
						className={mergeClasses('c-button icon', resolvedStyle.verticalAlign === 'top' ? 'active' : '')}
						onClick={() => handleVerticalAlignChange('top')}
						title="Align top"
						style={{ padding: '4px' }}
					>
						<IcAlignTop size={14} />
					</button>
					<button
						className={mergeClasses('c-button icon', resolvedStyle.verticalAlign === 'middle' ? 'active' : '')}
						onClick={() => handleVerticalAlignChange('middle')}
						title="Align middle"
						style={{ padding: '4px' }}
					>
						<IcAlignMiddle size={14} />
					</button>
					<button
						className={mergeClasses('c-button icon', resolvedStyle.verticalAlign === 'bottom' ? 'active' : '')}
						onClick={() => handleVerticalAlignChange('bottom')}
						title="Align bottom"
						style={{ padding: '4px' }}
					>
						<IcAlignBottom size={14} />
					</button>
				</div>
			</PropertyField>
		</PropertySection>
	)
}

// vim: ts=4
