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
 * Toolbar component - Main toolbar with drawing tools, formatting, and actions
 */

import * as React from 'react'
import { mergeClasses } from '../utils'

import {
	PiSelection as IcSelect,
	PiTextTBold as IcLabel,
	PiRectangleBold as IcRect,
	PiCircleBold as IcEllipse,
	PiMinusBold as IcLine,
	PiTrashBold as IcDelete,
	PiArrowArcLeftBold as IcUndo,
	PiArrowArcRightBold as IcRedo,
	PiGridFourBold as IcGrid,
	PiMagnetBold as IcSnapObjects,
	PiArrowsOutSimpleBold as IcSnapSizes,
	PiBugBold as IcDebug,
	PiArrowLineUpBold as IcBringToFront,
	PiArrowUpBold as IcBringForward,
	PiArrowDownBold as IcSendBackward,
	PiArrowLineDownBold as IcSendToBack,
	PiTextAlignLeftBold as IcAlignLeft,
	PiTextAlignCenterBold as IcAlignCenter,
	PiTextAlignRightBold as IcAlignRight,
	PiTextAlignJustifyBold as IcAlignJustify,
	PiAlignTopBold as IcAlignTop,
	PiAlignCenterVerticalBold as IcAlignMiddle,
	PiAlignBottomBold as IcAlignBottom,
	PiTextBBold as IcBold,
	PiTextItalicBold as IcItalic,
	PiTextUnderlineBold as IcUnderline
} from 'react-icons/pi'

import { FONT_SIZES } from '../utils/text-styles'

export interface ToolbarProps {
	className?: string
	tool: string | null
	setTool: (tool: string | null) => void
	hasSelection: boolean
	onDelete?: () => void
	canUndo: boolean
	canRedo: boolean
	onUndo?: () => void
	onRedo?: () => void
	// Z-index ordering
	onBringToFront?: () => void
	onBringForward?: () => void
	onSendBackward?: () => void
	onSendToBack?: () => void
	// Snap settings
	snapToGrid: boolean
	snapToObjects: boolean
	snapToSizes: boolean
	snapDebug: boolean
	onToggleSnapToGrid: () => void
	onToggleSnapToObjects: () => void
	onToggleSnapToSizes: () => void
	onToggleSnapDebug: () => void
	// Text alignment (only shown when text object selected)
	hasTextSelection?: boolean
	selectedTextAlign?: 'left' | 'center' | 'right' | 'justify'
	selectedVerticalAlign?: 'top' | 'middle' | 'bottom'
	onTextAlignChange?: (align: 'left' | 'center' | 'right' | 'justify') => void
	onVerticalAlignChange?: (align: 'top' | 'middle' | 'bottom') => void
	// Text formatting
	selectedFontSize?: number
	selectedBold?: boolean
	selectedItalic?: boolean
	selectedUnderline?: boolean
	onFontSizeChange?: (size: number) => void
	onBoldToggle?: () => void
	onItalicToggle?: () => void
	onUnderlineToggle?: () => void
}

export function Toolbar({
	className,
	tool,
	setTool,
	hasSelection,
	onDelete,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	onBringToFront,
	onBringForward,
	onSendBackward,
	onSendToBack,
	snapToGrid,
	snapToObjects,
	snapToSizes,
	snapDebug,
	onToggleSnapToGrid,
	onToggleSnapToObjects,
	onToggleSnapToSizes,
	onToggleSnapDebug,
	hasTextSelection,
	selectedTextAlign,
	selectedVerticalAlign,
	onTextAlignChange,
	onVerticalAlignChange,
	selectedFontSize,
	selectedBold,
	selectedItalic,
	selectedUnderline,
	onFontSizeChange,
	onBoldToggle,
	onItalicToggle,
	onUnderlineToggle
}: ToolbarProps) {
	return <div className={mergeClasses('c-nav c-hbox p-1 mb-1', className)}>
		<button
			onClick={() => setTool(null)}
			className={mergeClasses('c-button icon', tool === null ? 'active' : '')}
			title="Select"
		>
			<IcSelect/>
		</button>

		<button
			onClick={() => setTool('rect')}
			className={mergeClasses('c-button icon ms-1', tool === 'rect' ? 'active' : '')}
			title="Rectangle"
		>
			<IcRect/>
		</button>
		<button
			onClick={() => setTool('ellipse')}
			className={mergeClasses('c-button icon', tool === 'ellipse' ? 'active' : '')}
			title="Ellipse"
		>
			<IcEllipse/>
		</button>
		<button
			onClick={() => setTool('line')}
			className={mergeClasses('c-button icon', tool === 'line' ? 'active' : '')}
			title="Line"
		>
			<IcLine/>
		</button>
		<button
			onClick={() => setTool('text')}
			className={mergeClasses('c-button icon ms-1', tool === 'text' ? 'active' : '')}
			title="Text"
		>
			<IcLabel/>
		</button>

		{/* Snap toggles */}
		<div className="c-hbox ms-2" style={{ borderLeft: '1px solid var(--c-border)', paddingLeft: '0.5rem' }}>
			<button
				onClick={onToggleSnapToGrid}
				className={mergeClasses('c-button icon', snapToGrid ? 'active' : '')}
				title="Snap to grid"
			>
				<IcGrid/>
			</button>
			<button
				onClick={onToggleSnapToObjects}
				className={mergeClasses('c-button icon', snapToObjects ? 'active' : '')}
				title="Snap to objects"
			>
				<IcSnapObjects/>
			</button>
			<button
				onClick={onToggleSnapToSizes}
				className={mergeClasses('c-button icon', snapToSizes ? 'active' : '')}
				title="Snap to sizes"
			>
				<IcSnapSizes/>
			</button>
			<button
				onClick={onToggleSnapDebug}
				className={mergeClasses('c-button icon ms-1', snapDebug ? 'active' : '')}
				title="Snap debug mode"
			>
				<IcDebug/>
			</button>
		</div>

		<div className="flex-fill"/>

		<button
			onClick={onUndo}
			className="c-button icon"
			disabled={!canUndo}
			title="Undo"
		>
			<IcUndo/>
		</button>
		<button
			onClick={onRedo}
			className="c-button icon"
			disabled={!canRedo}
			title="Redo"
		>
			<IcRedo/>
		</button>

		{hasSelection && <>
			<div className="c-hbox ms-2" style={{ borderLeft: '1px solid var(--c-border)', paddingLeft: '0.5rem' }}>
				<button
					onClick={onBringToFront}
					className="c-button icon"
					title="Bring to front"
				>
					<IcBringToFront/>
				</button>
				<button
					onClick={onBringForward}
					className="c-button icon"
					title="Bring forward"
				>
					<IcBringForward/>
				</button>
				<button
					onClick={onSendBackward}
					className="c-button icon"
					title="Send backward"
				>
					<IcSendBackward/>
				</button>
				<button
					onClick={onSendToBack}
					className="c-button icon"
					title="Send to back"
				>
					<IcSendToBack/>
				</button>
			</div>

			{hasTextSelection && <>
				<div className="c-hbox ms-2" style={{ borderLeft: '1px solid var(--c-border)', paddingLeft: '0.5rem' }}>
					<button
						onClick={() => onTextAlignChange?.('left')}
						className={mergeClasses('c-button icon', selectedTextAlign === 'left' ? 'active' : '')}
						title="Align left"
					>
						<IcAlignLeft/>
					</button>
					<button
						onClick={() => onTextAlignChange?.('center')}
						className={mergeClasses('c-button icon', selectedTextAlign === 'center' ? 'active' : '')}
						title="Align center"
					>
						<IcAlignCenter/>
					</button>
					<button
						onClick={() => onTextAlignChange?.('right')}
						className={mergeClasses('c-button icon', selectedTextAlign === 'right' ? 'active' : '')}
						title="Align right"
					>
						<IcAlignRight/>
					</button>
					<button
						onClick={() => onTextAlignChange?.('justify')}
						className={mergeClasses('c-button icon', selectedTextAlign === 'justify' ? 'active' : '')}
						title="Justify"
					>
						<IcAlignJustify/>
					</button>
				</div>
				<div className="c-hbox ms-1">
					<button
						onClick={() => onVerticalAlignChange?.('top')}
						className={mergeClasses('c-button icon', selectedVerticalAlign === 'top' ? 'active' : '')}
						title="Align top"
					>
						<IcAlignTop/>
					</button>
					<button
						onClick={() => onVerticalAlignChange?.('middle')}
						className={mergeClasses('c-button icon', selectedVerticalAlign === 'middle' ? 'active' : '')}
						title="Align middle"
					>
						<IcAlignMiddle/>
					</button>
					<button
						onClick={() => onVerticalAlignChange?.('bottom')}
						className={mergeClasses('c-button icon', selectedVerticalAlign === 'bottom' ? 'active' : '')}
						title="Align bottom"
					>
						<IcAlignBottom/>
					</button>
				</div>
				<div className="c-hbox ms-2" style={{ borderLeft: '1px solid var(--c-border)', paddingLeft: '0.5rem' }}>
					<select
						value={selectedFontSize || 16}
						onChange={e => onFontSizeChange?.(Number(e.target.value))}
						className="c-input"
						style={{ width: '60px', padding: '2px 4px', fontSize: '12px' }}
						title="Font size"
					>
						{FONT_SIZES.map(size => (
							<option key={size} value={size}>{size}</option>
						))}
					</select>
				</div>
				<div className="c-hbox ms-1">
					<button
						onClick={onBoldToggle}
						className={mergeClasses('c-button icon', selectedBold ? 'active' : '')}
						title="Bold"
					>
						<IcBold/>
					</button>
					<button
						onClick={onItalicToggle}
						className={mergeClasses('c-button icon', selectedItalic ? 'active' : '')}
						title="Italic"
					>
						<IcItalic/>
					</button>
					<button
						onClick={onUnderlineToggle}
						className={mergeClasses('c-button icon', selectedUnderline ? 'active' : '')}
						title="Underline"
					>
						<IcUnderline/>
					</button>
				</div>
			</>}

			<button
				onClick={onDelete}
				className="c-button icon ms-1"
				title="Delete"
			>
				<IcDelete/>
			</button>
		</>}
	</div>
}

// vim: ts=4
