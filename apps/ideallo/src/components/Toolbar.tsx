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
 * Contains tool selection, undo/redo, and other controls
 */

import * as React from 'react'
import type { ToolType } from '../tools/index.js'

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
	PiExportBold as IcExport
} from 'react-icons/pi'

export interface ToolbarProps {
	activeTool: ToolType
	canUndo: boolean
	canRedo: boolean
	onToolChange: (tool: ToolType) => void
	onUndo: () => void
	onRedo: () => void
	onExport: () => void
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

export function Toolbar({
	activeTool,
	canUndo,
	canRedo,
	onToolChange,
	onUndo,
	onRedo,
	onExport
}: ToolbarProps) {
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

			<div className="ideallo-toolbar-divider" />

			{/* Export */}
			<button className="ideallo-tool-btn" onClick={onExport} title="Export">
				<IcExport size={24} />
			</button>
		</div>
	)
}

// vim: ts=4
