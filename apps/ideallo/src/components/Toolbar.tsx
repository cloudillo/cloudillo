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

export interface ToolbarProps {
	activeTool: ToolType
	canUndo: boolean
	canRedo: boolean
	onToolChange: (tool: ToolType) => void
	onUndo: () => void
	onRedo: () => void
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
	onRedo
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
				<svg viewBox="0 0 24 24" width="24" height="24">
					<path fill="currentColor" d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2 1-3.2-7.4L7 18z" />
				</svg>
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
				<svg viewBox="0 0 24 24" width="24" height="24">
					<path
						fill="currentColor"
						d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"
					/>
				</svg>
			</ToolButton>

			<ToolButton
				tool="eraser"
				activeTool={activeTool}
				title="Eraser"
				shortcut="X"
				onToolChange={onToolChange}
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<path
						fill="currentColor"
						d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.01 4.01 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.78 2.05.78 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z"
					/>
				</svg>
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
				<svg viewBox="0 0 24 24" width="24" height="24">
					<rect
						x="3"
						y="3"
						width="18"
						height="18"
						rx="2"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					/>
				</svg>
			</ToolButton>

			<ToolButton
				tool="ellipse"
				activeTool={activeTool}
				title="Ellipse"
				shortcut="E"
				onToolChange={onToolChange}
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<ellipse
						cx="12"
						cy="12"
						rx="9"
						ry="7"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					/>
				</svg>
			</ToolButton>

			<ToolButton
				tool="line"
				activeTool={activeTool}
				title="Line"
				shortcut="L"
				onToolChange={onToolChange}
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<line
						x1="4"
						y1="20"
						x2="20"
						y2="4"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</svg>
			</ToolButton>

			<ToolButton
				tool="arrow"
				activeTool={activeTool}
				title="Arrow"
				shortcut="A"
				onToolChange={onToolChange}
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<line
						x1="4"
						y1="20"
						x2="18"
						y2="6"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<polyline
						points="12,4 20,4 20,12"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</ToolButton>

			<ToolButton
				tool="text"
				activeTool={activeTool}
				title="Text"
				shortcut="T"
				onToolChange={onToolChange}
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<text
						x="12"
						y="17"
						textAnchor="middle"
						fill="currentColor"
						fontSize="14"
						fontWeight="bold"
					>
						T
					</text>
				</svg>
			</ToolButton>

			<ToolButton
				tool="sticky"
				activeTool={activeTool}
				title="Sticky Note"
				shortcut="S"
				onToolChange={onToolChange}
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<path
						fill="currentColor"
						d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8l6-6V5c0-1.1-.9-2-2-2zm-7 12H7v-2h5v2zm5-4H7V9h10v2zm0-4H7V5h10v2zm-1 10v-4h4l-4 4z"
					/>
				</svg>
			</ToolButton>

			<ToolButton
				tool="image"
				activeTool={activeTool}
				title="Image"
				shortcut="I"
				onToolChange={onToolChange}
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<rect
						x="3"
						y="3"
						width="18"
						height="18"
						rx="2"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					/>
					<circle cx="8" cy="8" r="2" fill="currentColor" />
					<path
						d="M21 15l-5-5-6 6"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
					<path
						d="M14 14l-3 3"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
				</svg>
			</ToolButton>

			<div className="ideallo-toolbar-divider" />

			{/* Undo/Redo */}
			<button
				className="ideallo-tool-btn"
				onClick={onUndo}
				disabled={!canUndo}
				title="Undo (Ctrl+Z)"
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<path
						fill="currentColor"
						d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"
					/>
				</svg>
			</button>

			<button
				className="ideallo-tool-btn"
				onClick={onRedo}
				disabled={!canRedo}
				title="Redo (Ctrl+Shift+Z)"
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<path
						fill="currentColor"
						d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"
					/>
				</svg>
			</button>
		</div>
	)
}

// vim: ts=4
