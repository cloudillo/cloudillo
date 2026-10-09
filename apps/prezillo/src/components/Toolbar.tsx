// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Toolbar component - Main toolbar with drawing tools, formatting, and actions
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	PiAlignBottomBold as IcAlignBottom,
	PiTextAlignCenterBold as IcAlignCenter,
	PiTextAlignJustifyBold as IcAlignJustify,
	PiTextAlignLeftBold as IcAlignLeft,
	PiAlignCenterVerticalBold as IcAlignMiddle,
	PiTextAlignRightBold as IcAlignRight,
	PiAlignTopBold as IcAlignTop,
	PiTextBBold as IcBold,
	PiArrowUpBold as IcBringForward,
	PiArrowLineUpBold as IcBringToFront,
	PiTrashBold as IcDelete,
	PiFileBold as IcDocument,
	PiCopyBold as IcDuplicate,
	PiCircleBold as IcEllipse,
	PiGridFourBold as IcGrid,
	PiImageBold as IcImage,
	PiTextItalicBold as IcItalic,
	PiTextTBold as IcLabel,
	PiMinusBold as IcLine,
	PiSidebarSimpleBold as IcPanel,
	PiChartBarBold as IcPollFrame,
	PiQrCodeBold as IcQrCode,
	PiRectangleBold as IcRect,
	PiArrowArcRightBold as IcRedo,
	PiSelection as IcSelect,
	PiArrowDownBold as IcSendBackward,
	PiArrowLineDownBold as IcSendToBack,
	PiEqualsBold as IcSnapDistribution,
	PiMagnetBold as IcSnapObjects,
	PiArrowsOutSimpleBold as IcSnapSizes,
	PiUsersBold as IcStateVar,
	PiTableBold as IcTable,
	PiTextUnderlineBold as IcUnderline,
	PiArrowArcLeftBold as IcUndo
} from 'react-icons/pi'
import type * as Y from 'yjs'

import type { YPrezilloDocument } from '../crdt'
import type { UseSnapSettingsResult } from '../hooks/useSnappingConfig'
import { mergeClasses } from '../utils'
import { FONT_SIZES } from '../utils/text-styles'
import { SymbolPicker } from './SymbolPicker'
import { ThemeDropdown } from './ThemeDropdown'

export interface ToolbarTextStyle {
	hasSelection: boolean
	align?: 'left' | 'center' | 'right' | 'justify'
	verticalAlign?: 'top' | 'middle' | 'bottom'
	fontSize?: number
	bold?: boolean
	italic?: boolean
	underline?: boolean
}

export interface ToolbarTextCmds {
	onAlignChange?: (align: 'left' | 'center' | 'right' | 'justify') => void
	onVerticalAlignChange?: (align: 'top' | 'middle' | 'bottom') => void
	onFontSizeChange?: (size: number) => void
	onBoldToggle?: () => void
	onItalicToggle?: () => void
	onUnderlineToggle?: () => void
}

export interface ToolbarZCmds {
	onBringToFront?: () => void
	onBringForward?: () => void
	onSendBackward?: () => void
	onSendToBack?: () => void
}

export interface ToolbarCmds {
	onDelete?: () => void
	onDuplicate?: () => void
	onUndo?: () => void
	onRedo?: () => void
}

export interface ToolbarProps {
	className?: string
	// Document refs for theme dropdown
	doc?: YPrezilloDocument
	yDoc?: Y.Doc
	// Tool state
	tool: string | null
	setTool: (tool: string | null) => void
	hasSelection: boolean
	canUndo: boolean
	canRedo: boolean
	// Grouped props
	cmds: ToolbarCmds
	zCmds: ToolbarZCmds
	snap: UseSnapSettingsResult
	textStyle: ToolbarTextStyle | null
	textCmds: ToolbarTextCmds
	// Properties panel
	isPanelVisible?: boolean
	onTogglePanel?: () => void
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
	canUndo,
	canRedo,
	cmds,
	zCmds,
	snap,
	textStyle,
	textCmds,
	isPanelVisible,
	onTogglePanel,
	selectedSymbolId,
	onSelectSymbol
}: ToolbarProps) {
	const { t } = useTranslation()
	return (
		<div className={mergeClasses('c-nav c-hbox p-1 mb-1', className)}>
			{/* Undo/Redo */}
			<button
				onClick={cmds.onUndo}
				className="c-button icon"
				disabled={!canUndo}
				title="Undo"
			>
				<IcUndo />
			</button>
			<button
				onClick={cmds.onRedo}
				className="c-button icon"
				disabled={!canRedo}
				title="Redo"
			>
				<IcRedo />
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
				title={t('Insert Image')}
			>
				<IcImage />
			</button>

			{/* Document embed tool */}
			<button
				onClick={() => setTool('document')}
				className={mergeClasses('c-button icon', tool === 'document' ? 'active' : '')}
				title={t('Embed Document')}
			>
				<IcDocument />
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
				onClick={snap.toggleSnapToGrid}
				className={mergeClasses('c-button icon', snap.settings.snapToGrid ? 'active' : '')}
				title="Snap to grid"
			>
				<IcGrid />
			</button>
			<button
				onClick={snap.toggleSnapToObjects}
				className={mergeClasses(
					'c-button icon',
					snap.settings.snapToObjects ? 'active' : ''
				)}
				title="Snap to objects"
			>
				<IcSnapObjects />
			</button>
			<button
				onClick={snap.toggleSnapToSizes}
				className={mergeClasses('c-button icon', snap.settings.snapToSizes ? 'active' : '')}
				title="Snap to sizes"
			>
				<IcSnapSizes />
			</button>
			<button
				onClick={snap.toggleSnapToDistribution}
				className={mergeClasses(
					'c-button icon',
					snap.settings.snapToDistribution ? 'active' : ''
				)}
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
						onClick={zCmds.onBringToFront}
						className="c-button icon"
						title="Bring to front"
					>
						<IcBringToFront />
					</button>
					<button
						onClick={zCmds.onBringForward}
						className="c-button icon"
						title="Bring forward"
					>
						<IcBringForward />
					</button>
					<button
						onClick={zCmds.onSendBackward}
						className="c-button icon"
						title="Send backward"
					>
						<IcSendBackward />
					</button>
					<button
						onClick={zCmds.onSendToBack}
						className="c-button icon"
						title="Send to back"
					>
						<IcSendToBack />
					</button>

					{/* Contextual: Text selection */}
					{textStyle?.hasSelection && (
						<>
							<div className="c-toolbar-divider" />

							{/* Horizontal alignment */}
							<button
								onClick={() => textCmds.onAlignChange?.('left')}
								className={mergeClasses(
									'c-button icon',
									textStyle?.align === 'left' ? 'active' : ''
								)}
								title="Align left"
							>
								<IcAlignLeft />
							</button>
							<button
								onClick={() => textCmds.onAlignChange?.('center')}
								className={mergeClasses(
									'c-button icon',
									textStyle?.align === 'center' ? 'active' : ''
								)}
								title="Align center"
							>
								<IcAlignCenter />
							</button>
							<button
								onClick={() => textCmds.onAlignChange?.('right')}
								className={mergeClasses(
									'c-button icon',
									textStyle?.align === 'right' ? 'active' : ''
								)}
								title="Align right"
							>
								<IcAlignRight />
							</button>
							<button
								onClick={() => textCmds.onAlignChange?.('justify')}
								className={mergeClasses(
									'c-button icon',
									textStyle?.align === 'justify' ? 'active' : ''
								)}
								title="Justify"
							>
								<IcAlignJustify />
							</button>

							<div className="c-toolbar-divider" />

							{/* Vertical alignment */}
							<button
								onClick={() => textCmds.onVerticalAlignChange?.('top')}
								className={mergeClasses(
									'c-button icon',
									textStyle?.verticalAlign === 'top' ? 'active' : ''
								)}
								title="Align top"
							>
								<IcAlignTop />
							</button>
							<button
								onClick={() => textCmds.onVerticalAlignChange?.('middle')}
								className={mergeClasses(
									'c-button icon',
									textStyle?.verticalAlign === 'middle' ? 'active' : ''
								)}
								title="Align middle"
							>
								<IcAlignMiddle />
							</button>
							<button
								onClick={() => textCmds.onVerticalAlignChange?.('bottom')}
								className={mergeClasses(
									'c-button icon',
									textStyle?.verticalAlign === 'bottom' ? 'active' : ''
								)}
								title="Align bottom"
							>
								<IcAlignBottom />
							</button>

							<div className="c-toolbar-divider" />

							{/* Font size */}
							<select
								value={textStyle?.fontSize || 16}
								onChange={(e) =>
									textCmds.onFontSizeChange?.(Number(e.target.value))
								}
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
								onClick={textCmds.onBoldToggle}
								className={mergeClasses(
									'c-button icon',
									textStyle?.bold ? 'active' : ''
								)}
								title="Bold"
							>
								<IcBold />
							</button>
							<button
								onClick={textCmds.onItalicToggle}
								className={mergeClasses(
									'c-button icon',
									textStyle?.italic ? 'active' : ''
								)}
								title="Italic"
							>
								<IcItalic />
							</button>
							<button
								onClick={textCmds.onUnderlineToggle}
								className={mergeClasses(
									'c-button icon',
									textStyle?.underline ? 'active' : ''
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
						onClick={cmds.onDuplicate}
						className="c-button icon"
						title="Duplicate (Ctrl+D)"
					>
						<IcDuplicate />
					</button>

					{/* Delete */}
					<button onClick={cmds.onDelete} className="c-button icon" title="Delete">
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
		</div>
	)
}

// vim: ts=4
