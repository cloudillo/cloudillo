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
 * Floating toolbar for Ideallo
 * Contains tool selection, undo/redo, and other controls.
 * On mobile (<=767px) renders a compact dock with grouped tool popovers.
 */

import * as React from 'react'
import { ActionSheet, ActionSheetItem, ActionSheetDivider } from '@cloudillo/react'
import type { ToolType } from '../tools/index.js'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { ToolGroup } from './ToolGroup.js'
import type { ToolGroupItem } from './ToolGroup.js'

import {
	PiCursorBold as IcSelect,
	PiPencilSimpleBold as IcPen,
	PiEraserBold as IcEraser,
	PiRectangleBold as IcRect,
	PiCircleBold as IcEllipse,
	PiLineSegmentBold as IcLine,
	PiArrowUpRightBold as IcArrow,
	PiTextTBold as IcText,
	PiNoteBold as IcSticky,
	PiImageBold as IcImage,
	PiArrowArcLeftBold as IcUndo,
	PiArrowArcRightBold as IcRedo,
	PiExportBold as IcExport,
	PiArrowLineUpBold as IcBringToFront,
	PiArrowUpBold as IcBringForward,
	PiArrowDownBold as IcSendBackward,
	PiArrowLineDownBold as IcSendToBack,
	PiDotsThreeBold as IcMore
} from 'react-icons/pi'

export interface ToolbarProps {
	activeTool: ToolType
	canUndo: boolean
	canRedo: boolean
	hasSelection: boolean
	onToolChange: (tool: ToolType) => void
	onUndo: () => void
	onRedo: () => void
	onExport: () => void
	onBringToFront: () => void
	onBringForward: () => void
	onSendBackward: () => void
	onSendToBack: () => void
}

interface ToolButtonProps {
	tool: ToolType
	activeTool: ToolType
	title: string
	shortcut: string
	onToolChange: (tool: ToolType) => void
	children: React.ReactNode
}

function ToolButton({
	tool,
	activeTool,
	title,
	shortcut,
	onToolChange,
	children
}: ToolButtonProps) {
	return (
		<button
			className={`ideallo-tool-btn ${activeTool === tool ? 'active' : ''}`}
			onClick={() => onToolChange(tool)}
			title={`${title} (${shortcut})`}
		>
			{children}
		</button>
	)
}

// Tool group definitions for mobile
const DRAW_TOOLS: ToolGroupItem[] = [
	{ tool: 'pen', icon: <IcPen size={22} />, title: 'Pen', shortcut: 'P' },
	{ tool: 'eraser', icon: <IcEraser size={22} />, title: 'Eraser', shortcut: 'X' }
]

const SHAPE_TOOLS: ToolGroupItem[] = [
	{ tool: 'rect', icon: <IcRect size={22} />, title: 'Rectangle', shortcut: 'R' },
	{ tool: 'ellipse', icon: <IcEllipse size={22} />, title: 'Ellipse', shortcut: 'E' },
	{ tool: 'line', icon: <IcLine size={22} />, title: 'Line', shortcut: 'L' },
	{ tool: 'arrow', icon: <IcArrow size={22} />, title: 'Arrow', shortcut: 'A' },
	{ tool: 'text', icon: <IcText size={22} />, title: 'Text', shortcut: 'T' },
	{ tool: 'sticky', icon: <IcSticky size={22} />, title: 'Sticky Note', shortcut: 'S' },
	{ tool: 'image', icon: <IcImage size={22} />, title: 'Image', shortcut: 'I' }
]

const DRAW_TOOL_SET = new Set<ToolType>(DRAW_TOOLS.map((t) => t.tool))
const SHAPE_TOOL_SET = new Set<ToolType>(SHAPE_TOOLS.map((t) => t.tool))

export function Toolbar({
	activeTool,
	canUndo,
	canRedo,
	hasSelection,
	onToolChange,
	onUndo,
	onRedo,
	onExport,
	onBringToFront,
	onBringForward,
	onSendBackward,
	onSendToBack
}: ToolbarProps) {
	const isMobile = useIsMobile()

	// Track last-used tool per group (for mobile group button icon)
	const [lastDrawTool, setLastDrawTool] = React.useState<ToolType>('pen')
	const [lastShapeTool, setLastShapeTool] = React.useState<ToolType>('rect')

	// ActionSheet open state for "More" overflow menu
	const [moreOpen, setMoreOpen] = React.useState(false)

	// Update last-used tool when activeTool changes
	React.useEffect(() => {
		if (DRAW_TOOL_SET.has(activeTool)) {
			setLastDrawTool(activeTool)
		} else if (SHAPE_TOOL_SET.has(activeTool)) {
			setLastShapeTool(activeTool)
		}
	}, [activeTool])

	// --- Mobile toolbar ---
	if (isMobile) {
		return (
			<div className="ideallo-toolbar">
				{/* Select */}
				<button
					className={`ideallo-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
					onClick={() => onToolChange('select')}
					title="Select (V)"
				>
					<IcSelect size={22} />
				</button>

				{/* Draw group: Pen / Eraser */}
				<ToolGroup
					items={DRAW_TOOLS}
					activeTool={activeTool}
					lastUsedTool={lastDrawTool}
					onToolChange={onToolChange}
				/>

				{/* Shape group: Rect, Ellipse, Line, Arrow, Text, Sticky, Image */}
				<ToolGroup
					items={SHAPE_TOOLS}
					activeTool={activeTool}
					lastUsedTool={lastShapeTool}
					onToolChange={onToolChange}
				/>

				<div className="ideallo-toolbar-divider" />

				{/* Undo / Redo */}
				<button
					className="ideallo-tool-btn"
					onClick={onUndo}
					disabled={!canUndo}
					title="Undo"
				>
					<IcUndo size={22} />
				</button>

				<button
					className="ideallo-tool-btn"
					onClick={onRedo}
					disabled={!canRedo}
					title="Redo"
				>
					<IcRedo size={22} />
				</button>

				{/* More */}
				<button className="ideallo-tool-btn" onClick={() => setMoreOpen(true)} title="More">
					<IcMore size={22} />
				</button>

				<ActionSheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Actions">
					{hasSelection && (
						<>
							<ActionSheetItem
								icon={<IcBringToFront size={20} />}
								label="Bring to Front"
								onClick={() => {
									onBringToFront()
									setMoreOpen(false)
								}}
							/>
							<ActionSheetItem
								icon={<IcBringForward size={20} />}
								label="Bring Forward"
								onClick={() => {
									onBringForward()
									setMoreOpen(false)
								}}
							/>
							<ActionSheetItem
								icon={<IcSendBackward size={20} />}
								label="Send Backward"
								onClick={() => {
									onSendBackward()
									setMoreOpen(false)
								}}
							/>
							<ActionSheetItem
								icon={<IcSendToBack size={20} />}
								label="Send to Back"
								onClick={() => {
									onSendToBack()
									setMoreOpen(false)
								}}
							/>
							<ActionSheetDivider />
						</>
					)}
					<ActionSheetItem
						icon={<IcExport size={20} />}
						label="Export"
						onClick={() => {
							onExport()
							setMoreOpen(false)
						}}
					/>
				</ActionSheet>
			</div>
		)
	}

	// --- Desktop toolbar (unchanged) ---
	return (
		<div className="ideallo-toolbar">
			{/* Select tool */}
			<ToolButton
				tool="select"
				activeTool={activeTool}
				title="Select"
				shortcut="V"
				onToolChange={onToolChange}
			>
				<IcSelect size={24} />
			</ToolButton>

			<div className="ideallo-toolbar-divider" />

			{/* Drawing tools */}
			<ToolButton
				tool="pen"
				activeTool={activeTool}
				title="Pen"
				shortcut="P"
				onToolChange={onToolChange}
			>
				<IcPen size={24} />
			</ToolButton>

			<ToolButton
				tool="eraser"
				activeTool={activeTool}
				title="Eraser"
				shortcut="X"
				onToolChange={onToolChange}
			>
				<IcEraser size={24} />
			</ToolButton>

			<div className="ideallo-toolbar-divider" />

			{/* Shape tools */}
			<ToolButton
				tool="rect"
				activeTool={activeTool}
				title="Rectangle"
				shortcut="R"
				onToolChange={onToolChange}
			>
				<IcRect size={24} />
			</ToolButton>

			<ToolButton
				tool="ellipse"
				activeTool={activeTool}
				title="Ellipse"
				shortcut="E"
				onToolChange={onToolChange}
			>
				<IcEllipse size={24} />
			</ToolButton>

			<ToolButton
				tool="line"
				activeTool={activeTool}
				title="Line"
				shortcut="L"
				onToolChange={onToolChange}
			>
				<IcLine size={24} />
			</ToolButton>

			<ToolButton
				tool="arrow"
				activeTool={activeTool}
				title="Arrow"
				shortcut="A"
				onToolChange={onToolChange}
			>
				<IcArrow size={24} />
			</ToolButton>

			<ToolButton
				tool="text"
				activeTool={activeTool}
				title="Text"
				shortcut="T"
				onToolChange={onToolChange}
			>
				<IcText size={24} />
			</ToolButton>

			<ToolButton
				tool="sticky"
				activeTool={activeTool}
				title="Sticky Note"
				shortcut="S"
				onToolChange={onToolChange}
			>
				<IcSticky size={24} />
			</ToolButton>

			<ToolButton
				tool="image"
				activeTool={activeTool}
				title="Image"
				shortcut="I"
				onToolChange={onToolChange}
			>
				<IcImage size={24} />
			</ToolButton>

			<div className="ideallo-toolbar-divider" />

			{/* Undo/Redo */}
			<button
				className="ideallo-tool-btn"
				onClick={onUndo}
				disabled={!canUndo}
				title="Undo (Ctrl+Z)"
			>
				<IcUndo size={24} />
			</button>

			<button
				className="ideallo-tool-btn"
				onClick={onRedo}
				disabled={!canRedo}
				title="Redo (Ctrl+Shift+Z)"
			>
				<IcRedo size={24} />
			</button>

			{/* Z-order (shown when objects are selected) */}
			{hasSelection && (
				<>
					<div className="ideallo-toolbar-divider" />

					<button
						className="ideallo-tool-btn"
						onClick={onBringToFront}
						title="Bring to Front (Ctrl+Shift+])"
					>
						<IcBringToFront size={24} />
					</button>

					<button
						className="ideallo-tool-btn"
						onClick={onBringForward}
						title="Bring Forward (Ctrl+])"
					>
						<IcBringForward size={24} />
					</button>

					<button
						className="ideallo-tool-btn"
						onClick={onSendBackward}
						title="Send Backward (Ctrl+[)"
					>
						<IcSendBackward size={24} />
					</button>

					<button
						className="ideallo-tool-btn"
						onClick={onSendToBack}
						title="Send to Back (Ctrl+Shift+[)"
					>
						<IcSendToBack size={24} />
					</button>
				</>
			)}

			<div className="ideallo-toolbar-divider" />

			{/* Export */}
			<button className="ideallo-tool-btn" onClick={onExport} title="Export">
				<IcExport size={24} />
			</button>
		</div>
	)
}

// vim: ts=4
