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
import * as Y from 'yjs'
import { mergeClasses } from '../utils'
import type { YPrezilloDocument } from '../crdt'
import { ThemeDropdown } from './ThemeDropdown'
import { SymbolPicker } from './SymbolPicker'

import {
	PiSelection as IcSelect,
	PiTextTBold as IcLabel,
	PiRectangleBold as IcRect,
	PiCircleBold as IcEllipse,
	PiMinusBold as IcLine,
	PiImageBold as IcImage,
	PiQrCodeBold as IcQrCode,
	PiChartBarBold as IcPollFrame,
	PiTableBold as IcTable,
	PiUsersBold as IcStateVar,
	PiTrashBold as IcDelete,
	PiCopyBold as IcDuplicate,
	PiArrowArcLeftBold as IcUndo,
	PiArrowArcRightBold as IcRedo,
	PiExportBold as IcExport,
	PiFilePdfBold as IcPDF,
	PiGridFourBold as IcGrid,
	PiMagnetBold as IcSnapObjects,
	PiArrowsOutSimpleBold as IcSnapSizes,
	PiEqualsBold as IcSnapDistribution,
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
	PiTextUnderlineBold as IcUnderline,
	PiSidebarSimpleBold as IcPanel,
	PiDotsThreeVerticalBold as IcMenu,
	PiWrenchBold as IcRepair
} from 'react-icons/pi'

import { FONT_SIZES } from '../utils/text-styles'

// App version injected at build time
declare const __APP_VERSION__: string

export interface ToolbarProps {
	className?: string
	// Document refs for theme dropdown
	doc?: YPrezilloDocument
	yDoc?: Y.Doc
	// Tool state
	tool: string | null
	setTool: (tool: string | null) => void
	hasSelection: boolean
	onDelete?: () => void
	onDuplicate?: () => void
	canUndo: boolean
	canRedo: boolean
	onUndo?: () => void
	onRedo?: () => void
	onExport?: () => void
	onExportPDF?: () => void
	isExportingPDF?: boolean
	// Z-index ordering
	onBringToFront?: () => void
	onBringForward?: () => void
	onSendBackward?: () => void
	onSendToBack?: () => void
	// Snap settings
	snapToGrid: boolean
	snapToObjects: boolean
	snapToSizes: boolean
	snapToDistribution: boolean
	snapDebug: boolean
	onToggleSnapToGrid: () => void
	onToggleSnapToObjects: () => void
	onToggleSnapToSizes: () => void
	onToggleSnapToDistribution: () => void
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
	// Properties panel
	isPanelVisible?: boolean
	onTogglePanel?: () => void
	// Menu actions
	onCheckDocument?: () => void
	// Symbol picker
	selectedSymbolId?: string | null
	onSelectSymbol?: (symbolId: string) => void
}

export function Toolbar({
	className,
	doc,
	yDoc,
	tool,
	setTool,
	hasSelection,
	onDelete,
	onDuplicate,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	onExport,
	onExportPDF,
	isExportingPDF,
	onBringToFront,
	onBringForward,
	onSendBackward,
	onSendToBack,
	snapToGrid,
	snapToObjects,
	snapToSizes,
	snapToDistribution,
	snapDebug,
	onToggleSnapToGrid,
	onToggleSnapToObjects,
	onToggleSnapToSizes,
	onToggleSnapToDistribution,
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
	onUnderlineToggle,
	isPanelVisible,
	onTogglePanel,
	onCheckDocument,
	selectedSymbolId,
	onSelectSymbol
}: ToolbarProps) {
	const [menuOpen, setMenuOpen] = React.useState(false)
	const menuRef = React.useRef<HTMLDivElement>(null)

	// Close menu when clicking outside
	React.useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setMenuOpen(false)
			}
		}
		if (menuOpen) {
			document.addEventListener('mousedown', handleClickOutside)
			return () => document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [menuOpen])

	return (
		<div className={mergeClasses('c-nav c-hbox p-1 mb-1', className)}>
			{/* Undo/Redo */}
			<button onClick={onUndo} className="c-button icon" disabled={!canUndo} title="Undo">
				<IcUndo />
			</button>
			<button onClick={onRedo} className="c-button icon" disabled={!canRedo} title="Redo">
				<IcRedo />
			</button>

			<div className="c-toolbar-divider" />

			{/* PDF Export - keep prominent */}
			<button
				onClick={onExportPDF}
				className="c-button icon"
				disabled={isExportingPDF}
				title="Export to PDF"
			>
				<IcPDF />
			</button>

			<div className="c-toolbar-divider" />

			{/* Select tool */}
			<button
				onClick={() => setTool(null)}
				className={mergeClasses('c-button icon', tool === null ? 'active' : '')}
				title="Select"
			>
				<IcSelect />
			</button>

			<div className="c-toolbar-divider" />

			{/* Shape tools */}
			<button
				onClick={() => setTool('rect')}
				className={mergeClasses('c-button icon', tool === 'rect' ? 'active' : '')}
				title="Rectangle"
			>
				<IcRect />
			</button>
			<button
				onClick={() => setTool('ellipse')}
				className={mergeClasses('c-button icon', tool === 'ellipse' ? 'active' : '')}
				title="Ellipse"
			>
				<IcEllipse />
			</button>
			<button
				onClick={() => setTool('line')}
				className={mergeClasses('c-button icon', tool === 'line' ? 'active' : '')}
				title="Line"
			>
				<IcLine />
			</button>

			<div className="c-toolbar-divider" />

			{/* Text tool */}
			<button
				onClick={() => setTool('text')}
				className={mergeClasses('c-button icon', tool === 'text' ? 'active' : '')}
				title="Text"
			>
				<IcLabel />
			</button>

			{/* Image tool */}
			<button
				onClick={() => setTool('image')}
				className={mergeClasses('c-button icon', tool === 'image' ? 'active' : '')}
				title="Image"
			>
				<IcImage />
			</button>

			{/* QR Code tool */}
			<button
				onClick={() => setTool('qrcode')}
				className={mergeClasses('c-button icon', tool === 'qrcode' ? 'active' : '')}
				title="QR Code"
			>
				<IcQrCode />
			</button>

			{/* Poll Frame tool */}
			<button
				onClick={() => setTool('pollframe')}
				className={mergeClasses('c-button icon', tool === 'pollframe' ? 'active' : '')}
				title="Poll Frame"
			>
				<IcPollFrame />
			</button>

			{/* Table Grid tool */}
			<button
				onClick={() => setTool('tablegrid')}
				className={mergeClasses('c-button icon', tool === 'tablegrid' ? 'active' : '')}
				title="Table Grid"
			>
				<IcTable />
			</button>

			{/* State Variable tool (live user count) */}
			<button
				onClick={() => setTool('statevar')}
				className={mergeClasses('c-button icon', tool === 'statevar' ? 'active' : '')}
				title="Live Users Count"
			>
				<IcStateVar />
			</button>

			{/* Symbol tool */}
			<SymbolPicker
				isActive={tool === 'symbol'}
				selectedSymbolId={selectedSymbolId ?? null}
				onSelectSymbol={(symbolId) => {
					onSelectSymbol?.(symbolId)
					setTool('symbol')
				}}
				onClose={() => {
					if (tool === 'symbol') setTool(null)
				}}
			/>

			<div className="c-toolbar-divider" />

			{/* Snap settings */}
			<button
				onClick={onToggleSnapToGrid}
				className={mergeClasses('c-button icon', snapToGrid ? 'active' : '')}
				title="Snap to grid"
			>
				<IcGrid />
			</button>
			<button
				onClick={onToggleSnapToObjects}
				className={mergeClasses('c-button icon', snapToObjects ? 'active' : '')}
				title="Snap to objects"
			>
				<IcSnapObjects />
			</button>
			<button
				onClick={onToggleSnapToSizes}
				className={mergeClasses('c-button icon', snapToSizes ? 'active' : '')}
				title="Snap to sizes"
			>
				<IcSnapSizes />
			</button>
			<button
				onClick={onToggleSnapToDistribution}
				className={mergeClasses('c-button icon', snapToDistribution ? 'active' : '')}
				title="Snap to equal spacing"
			>
				<IcSnapDistribution />
			</button>

			<div className="flex-fill" />

			{/* Contextual: Object selection */}
			{hasSelection && (
				<>
					<div className="c-toolbar-divider" />

					{/* Z-order controls */}
					<button
						onClick={onBringToFront}
						className="c-button icon"
						title="Bring to front"
					>
						<IcBringToFront />
					</button>
					<button
						onClick={onBringForward}
						className="c-button icon"
						title="Bring forward"
					>
						<IcBringForward />
					</button>
					<button
						onClick={onSendBackward}
						className="c-button icon"
						title="Send backward"
					>
						<IcSendBackward />
					</button>
					<button onClick={onSendToBack} className="c-button icon" title="Send to back">
						<IcSendToBack />
					</button>

					{/* Contextual: Text selection */}
					{hasTextSelection && (
						<>
							<div className="c-toolbar-divider" />

							{/* Horizontal alignment */}
							<button
								onClick={() => onTextAlignChange?.('left')}
								className={mergeClasses(
									'c-button icon',
									selectedTextAlign === 'left' ? 'active' : ''
								)}
								title="Align left"
							>
								<IcAlignLeft />
							</button>
							<button
								onClick={() => onTextAlignChange?.('center')}
								className={mergeClasses(
									'c-button icon',
									selectedTextAlign === 'center' ? 'active' : ''
								)}
								title="Align center"
							>
								<IcAlignCenter />
							</button>
							<button
								onClick={() => onTextAlignChange?.('right')}
								className={mergeClasses(
									'c-button icon',
									selectedTextAlign === 'right' ? 'active' : ''
								)}
								title="Align right"
							>
								<IcAlignRight />
							</button>
							<button
								onClick={() => onTextAlignChange?.('justify')}
								className={mergeClasses(
									'c-button icon',
									selectedTextAlign === 'justify' ? 'active' : ''
								)}
								title="Justify"
							>
								<IcAlignJustify />
							</button>

							<div className="c-toolbar-divider" />

							{/* Vertical alignment */}
							<button
								onClick={() => onVerticalAlignChange?.('top')}
								className={mergeClasses(
									'c-button icon',
									selectedVerticalAlign === 'top' ? 'active' : ''
								)}
								title="Align top"
							>
								<IcAlignTop />
							</button>
							<button
								onClick={() => onVerticalAlignChange?.('middle')}
								className={mergeClasses(
									'c-button icon',
									selectedVerticalAlign === 'middle' ? 'active' : ''
								)}
								title="Align middle"
							>
								<IcAlignMiddle />
							</button>
							<button
								onClick={() => onVerticalAlignChange?.('bottom')}
								className={mergeClasses(
									'c-button icon',
									selectedVerticalAlign === 'bottom' ? 'active' : ''
								)}
								title="Align bottom"
							>
								<IcAlignBottom />
							</button>

							<div className="c-toolbar-divider" />

							{/* Font size */}
							<select
								value={selectedFontSize || 16}
								onChange={(e) => onFontSizeChange?.(Number(e.target.value))}
								className="c-input c-font-size-select"
								title="Font size"
							>
								{FONT_SIZES.map((size) => (
									<option key={size} value={size}>
										{size}
									</option>
								))}
							</select>

							<div className="c-toolbar-divider" />

							{/* Text style */}
							<button
								onClick={onBoldToggle}
								className={mergeClasses(
									'c-button icon',
									selectedBold ? 'active' : ''
								)}
								title="Bold"
							>
								<IcBold />
							</button>
							<button
								onClick={onItalicToggle}
								className={mergeClasses(
									'c-button icon',
									selectedItalic ? 'active' : ''
								)}
								title="Italic"
							>
								<IcItalic />
							</button>
							<button
								onClick={onUnderlineToggle}
								className={mergeClasses(
									'c-button icon',
									selectedUnderline ? 'active' : ''
								)}
								title="Underline"
							>
								<IcUnderline />
							</button>
						</>
					)}

					<div className="c-toolbar-divider" />

					{/* Duplicate */}
					<button
						onClick={onDuplicate}
						className="c-button icon"
						title="Duplicate (Ctrl+D)"
					>
						<IcDuplicate />
					</button>

					{/* Delete */}
					<button onClick={onDelete} className="c-button icon" title="Delete">
						<IcDelete />
					</button>
				</>
			)}

			{/* Theme dropdown */}
			{doc && yDoc && <ThemeDropdown doc={doc} yDoc={yDoc} />}

			<div className="c-toolbar-divider" />

			{/* Panel toggle */}
			<button
				onClick={onTogglePanel}
				className={mergeClasses('c-button icon', isPanelVisible ? 'active' : '')}
				title="Toggle properties panel"
			>
				<IcPanel />
			</button>

			<div className="c-toolbar-divider" />

			{/* More menu */}
			<div ref={menuRef} style={{ position: 'relative' }}>
				<button
					onClick={() => setMenuOpen(!menuOpen)}
					className={mergeClasses('c-button icon', menuOpen ? 'active' : '')}
					title="More options"
				>
					<IcMenu />
				</button>
				{menuOpen && (
					<div className="c-menu" style={{ position: 'absolute', top: '100%', right: 0 }}>
						<button
							onClick={() => {
								onExport?.()
								setMenuOpen(false)
							}}
							className="c-menu-item"
						>
							<span className="c-menu-item-icon">
								<IcExport />
							</span>
							<span className="c-menu-item-label">Export to JSON</span>
						</button>
						<div className="c-menu-divider" />
						<button
							onClick={() => {
								onToggleSnapDebug?.()
								setMenuOpen(false)
							}}
							className="c-menu-item"
						>
							<span className="c-menu-item-icon">
								<IcDebug />
							</span>
							<span className="c-menu-item-label">
								Snap Debug Mode {snapDebug ? '✓' : ''}
							</span>
						</button>
						<button
							onClick={() => {
								onCheckDocument?.()
								setMenuOpen(false)
							}}
							className="c-menu-item"
						>
							<span className="c-menu-item-icon">
								<IcRepair />
							</span>
							<span className="c-menu-item-label">Check Document...</span>
						</button>
						<div className="c-menu-divider" />
						<div
							className="c-menu-item disabled"
							style={{ opacity: 0.6, cursor: 'default' }}
						>
							<span className="c-menu-item-label">Prezillo v{__APP_VERSION__}</span>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

// vim: ts=4
