// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The tool catalog: one description of every tool, shared by the toolbar, the keyboard shortcuts
 * and the announcements.
 *
 * Deliberately React-free. The tool tests import from `tools/*`, and pulling `react-icons` into
 * this module graph would buy nothing but ts-jest ESM interop risk - the icons live in
 * `components/tool-icons.ts` instead.
 */

import type { DragShapeTool, ToolType } from './types.js'

export type ToolCategory = 'select' | 'draw' | 'shape' | 'connector' | 'text' | 'embed'

export interface ToolDescriptor {
	tool: ToolType
	label: string
	category: ToolCategory
	/** Display form for the tooltip, e.g. 'L, A' */
	shortcut: string
	/** Lowercased keys that arm this tool. Globally unique - see the test. */
	keys: string[]
	/** Extra modifier hint appended to the toolbar tooltip, e.g. 'hold Alt for free placement' */
	hint?: string
}

/** Exhaustive by construction: a new ToolType without a descriptor is a compile error. */
export const TOOL_CATALOG: Record<ToolType, ToolDescriptor> = {
	select: { tool: 'select', label: 'Select', category: 'select', shortcut: 'V', keys: ['v'] },
	pen: { tool: 'pen', label: 'Pen', category: 'draw', shortcut: 'P', keys: ['p'] },
	eraser: { tool: 'eraser', label: 'Eraser', category: 'draw', shortcut: 'X', keys: ['x'] },
	rect: { tool: 'rect', label: 'Rectangle', category: 'shape', shortcut: 'R', keys: ['r'] },
	ellipse: { tool: 'ellipse', label: 'Ellipse', category: 'shape', shortcut: 'E', keys: ['e'] },
	// M and G are the only free letters that appear in the words: diaMond, trianGle
	diamond: { tool: 'diamond', label: 'Diamond', category: 'shape', shortcut: 'M', keys: ['m'] },
	triangle: {
		tool: 'triangle',
		label: 'Triangle',
		category: 'shape',
		shortcut: 'G',
		keys: ['g']
	},
	connector: {
		tool: 'connector',
		label: 'Connector',
		category: 'connector',
		shortcut: 'L, A',
		keys: ['l', 'a'],
		hint: 'hold Alt for free placement'
	},
	text: { tool: 'text', label: 'Text', category: 'text', shortcut: 'T', keys: ['t'] },
	sticky: { tool: 'sticky', label: 'Sticky Note', category: 'text', shortcut: 'S', keys: ['s'] },
	image: { tool: 'image', label: 'Image', category: 'embed', shortcut: 'I', keys: ['i'] },
	document: { tool: 'document', label: 'Document', category: 'embed', shortcut: 'D', keys: ['d'] }
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
	select: 'Select',
	draw: 'Draw',
	shape: 'Shapes',
	connector: 'Connector',
	text: 'Text & notes',
	embed: 'Embeds'
}

/** Row order in the mobile popover. */
export const CATEGORY_ORDER: ToolCategory[] = ['draw', 'shape', 'connector', 'text', 'embed']

const ALL_DESCRIPTORS = Object.values(TOOL_CATALOG)

export const TOOLS_BY_CATEGORY: Record<ToolCategory, ToolDescriptor[]> = (() => {
	const byCategory = {} as Record<ToolCategory, ToolDescriptor[]>
	for (const category of Object.keys(CATEGORY_LABELS) as ToolCategory[]) {
		byCategory[category] = ALL_DESCRIPTORS.filter((d) => d.category === category)
	}
	return byCategory
})()

/** Shared with the toolbar tooltips and the announcements, so the two cannot drift. */
export const TOOL_LABELS: Record<ToolType, string> = (() => {
	const labels = {} as Record<ToolType, string>
	for (const d of ALL_DESCRIPTORS) labels[d.tool] = d.label
	return labels
})()

/** Keyboard shortcut lookup. Keys are lowercased, so the handler lowercases too. */
export const TOOL_BY_KEY: Record<string, ToolType> = (() => {
	const byKey: Record<string, ToolType> = {}
	for (const d of ALL_DESCRIPTORS) {
		for (const key of d.keys) byKey[key] = d.tool
	}
	return byKey
})()

/** Tools whose gesture is a drag-out box handled by useShapeHandler. */
export function isDragShapeTool(tool: ToolType): tool is DragShapeTool {
	const category = TOOL_CATALOG[tool].category
	return category === 'shape' || category === 'connector'
}

// vim: ts=4
