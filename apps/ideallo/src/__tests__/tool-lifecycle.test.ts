// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { toObjectId } from '../crdt/ids.js'
import type { ToolCategory } from '../tools/catalog.js'
import {
	CATEGORY_LABELS,
	CATEGORY_ORDER,
	isDragShapeTool,
	TOOL_CATALOG,
	TOOL_LABELS,
	TOOLS_BY_CATEGORY
} from '../tools/catalog.js'
import {
	ALWAYS_REVERT_TOOLS,
	CONTINUOUS_TOOLS,
	isCommittableShapePreview,
	isOneShotTool,
	nextToolAfterUse,
	shouldRemoveOnEditEnd,
	shouldSelectAfterUse,
	takePending
} from '../tools/lifecycle.js'
import type { ShapePreview, ToolType } from '../tools/types.js'

/**
 * The catalog IS the tool list. `Record<ToolType, ToolDescriptor>` already fails to compile when a
 * tool is added without a descriptor, which is a strictly better tripwire than a hand-listed array
 * with a length assertion.
 */
const ALL_TOOLS = Object.keys(TOOL_CATALOG) as ToolType[]

/**
 * Listed by hand on purpose: the one-shot/continuous split is a DECISION about each tool, so it
 * should be restated here rather than derived from the code under test.
 */
const ONE_SHOT_TOOLS: ToolType[] = [
	'rect',
	'ellipse',
	'diamond',
	'triangle',
	'connector',
	'text',
	'sticky'
]

describe('tool catalog', () => {
	it('gives every tool a category and a non-empty label', () => {
		ALL_TOOLS.forEach((tool) => {
			const descriptor = TOOL_CATALOG[tool]
			expect(descriptor.tool).toBe(tool)
			expect(descriptor.label).toBeTruthy()
			expect(descriptor.shortcut).toBeTruthy()
			expect(CATEGORY_LABELS[descriptor.category]).toBeTruthy()
		})
	})

	it('places every tool in exactly one category and leaves no category empty', () => {
		const seen = (['select', ...CATEGORY_ORDER] as ToolCategory[]).flatMap((category) =>
			TOOLS_BY_CATEGORY[category].map((descriptor) => descriptor.tool)
		)
		expect(new Set(seen)).toEqual(new Set(ALL_TOOLS))
		expect(seen).toHaveLength(ALL_TOOLS.length)
		for (const category of Object.keys(CATEGORY_LABELS) as ToolCategory[]) {
			expect(TOOLS_BY_CATEGORY[category].length).toBeGreaterThan(0)
		}
	})

	it('never lets two tools claim the same key', () => {
		const keys = ALL_TOOLS.flatMap((tool) => TOOL_CATALOG[tool].keys)
		expect(keys.every((key) => key === key.toLowerCase())).toBe(true)
		expect(new Set(keys).size).toBe(keys.length)
	})

	it('treats the drag-out shape and connector categories as drag tools, nothing else', () => {
		ALL_TOOLS.forEach((tool) => {
			const category = TOOL_CATALOG[tool].category
			expect(isDragShapeTool(tool)).toBe(category === 'shape' || category === 'connector')
		})
	})
})

describe('tool lifecycle classification', () => {
	it('partitions the tools into continuous and one-shot with no overlap or gap', () => {
		const oneShot = ALL_TOOLS.filter((tool) => isOneShotTool(tool))
		const continuous = ALL_TOOLS.filter((tool) => !isOneShotTool(tool))

		expect(new Set(continuous)).toEqual(new Set(CONTINUOUS_TOOLS))
		expect(oneShot.length + continuous.length).toBe(ALL_TOOLS.length)
		expect(oneShot.some((tool) => CONTINUOUS_TOOLS.has(tool))).toBe(false)
	})

	it('classifies the always-revert tools as one-shot too', () => {
		ALWAYS_REVERT_TOOLS.forEach((tool) => {
			expect(isOneShotTool(tool)).toBe(true)
		})
	})

	it('labels every tool', () => {
		ALL_TOOLS.forEach((tool) => {
			expect(TOOL_LABELS[tool]).toBeTruthy()
		})
	})
})

describe('nextToolAfterUse', () => {
	it('keeps continuous tools armed, locked or not', () => {
		CONTINUOUS_TOOLS.forEach((tool) => {
			expect(nextToolAfterUse(tool, false)).toBe(tool)
			expect(nextToolAfterUse(tool, true)).toBe(tool)
		})
	})

	it('reverts one-shot tools to select when unlocked', () => {
		ONE_SHOT_TOOLS.forEach((tool) => {
			expect(nextToolAfterUse(tool, false)).toBe('select')
		})
	})

	it('keeps one-shot tools armed when locked', () => {
		ONE_SHOT_TOOLS.forEach((tool) => {
			expect(nextToolAfterUse(tool, true)).toBe(tool)
		})
	})

	// A locked image tool could never be re-triggered: its picker opens from an effect keyed on
	// the active tool, and re-selecting the tool it is already on is not a state change.
	it('reverts image and document even when locked', () => {
		expect(nextToolAfterUse('image', true)).toBe('select')
		expect(nextToolAfterUse('document', true)).toBe('select')
		expect(nextToolAfterUse('image', false)).toBe('select')
		expect(nextToolAfterUse('document', false)).toBe('select')
	})
})

describe('shouldSelectAfterUse', () => {
	it('selects what a one-shot tool placed when unlocked', () => {
		ONE_SHOT_TOOLS.forEach((tool) => {
			expect(shouldSelectAfterUse(tool, false)).toBe(true)
		})
		expect(shouldSelectAfterUse('image', false)).toBe(true)
		expect(shouldSelectAfterUse('document', false)).toBe(true)
	})

	// Selecting under an armed tool would leave resize handles floating beneath a crosshair
	it('selects nothing when locked', () => {
		ALL_TOOLS.forEach((tool) => {
			if (ALWAYS_REVERT_TOOLS.has(tool)) return
			expect(shouldSelectAfterUse(tool, true)).toBe(false)
		})
	})

	it('never treats select itself as a placement', () => {
		expect(shouldSelectAfterUse('select', false)).toBe(false)
		expect(shouldSelectAfterUse('select', true)).toBe(false)
	})

	it('leaves continuous tools alone', () => {
		expect(shouldSelectAfterUse('pen', false)).toBe(false)
		expect(shouldSelectAfterUse('eraser', false)).toBe(false)
	})
})

function preview(over: Partial<ShapePreview> = {}): ShapePreview {
	return {
		type: 'connector',
		startX: 100,
		startY: 100,
		endX: 100,
		endY: 100,
		style: { strokeColor: '#000000', fillColor: 'transparent', strokeWidth: 2 },
		...over
	}
}

const SHAPE_A = toObjectId('shape-a')
const SHAPE_B = toObjectId('shape-b')

describe('isCommittableShapePreview', () => {
	it('rejects a drag under the floor on both axes', () => {
		expect(isCommittableShapePreview(preview({ type: 'rect' }))).toBe(false)
		expect(isCommittableShapePreview(preview({ type: 'rect', endX: 104, endY: 103 }))).toBe(
			false
		)
	})

	it('accepts a drag past the floor on either axis alone', () => {
		expect(isCommittableShapePreview(preview({ type: 'rect', endX: 105 }))).toBe(true)
		expect(isCommittableShapePreview(preview({ type: 'rect', endY: 105 }))).toBe(true)
	})

	it('measures the drag, not its sign', () => {
		expect(isCommittableShapePreview(preview({ type: 'rect', endX: 90 }))).toBe(true)
	})

	// handlePointerDown binds the START terminal on any press over a shape, so without this a
	// plain click slips past the size floor and commits an invisible zero-length arrow.
	it('rejects a click that bound only the start terminal', () => {
		expect(isCommittableShapePreview(preview({ startObjectId: SHAPE_A }))).toBe(false)
	})

	it('rejects a click that bound only the end terminal', () => {
		expect(isCommittableShapePreview(preview({ endObjectId: SHAPE_B }))).toBe(false)
	})

	it('accepts a short connector bound at both ends - two adjacent boxes', () => {
		expect(
			isCommittableShapePreview(
				preview({ startObjectId: SHAPE_A, endObjectId: SHAPE_B, endX: 102 })
			)
		).toBe(true)
	})
})

/**
 * The shape and drag pointerup handlers read their pending gesture from a REF, because the
 * React state setter is asynchronous - two releases in the same frame both saw the state as it
 * was. The discard path cleared the ref; the COMMIT paths only cleared the state, so a repeated
 * release re-ran addObject (a duplicate shape) or re-applied the same translate delta (an object
 * that jumped twice as far as it was dragged).
 *
 * takePending is what closed that: the read and the clear cannot be separated, so every exit path
 * consumes the gesture - including any added later.
 */
describe('takePending', () => {
	it('returns the pending value and empties the slot', () => {
		const ref = { current: preview({ type: 'rect', endX: 200 }) as ShapePreview | null }
		const taken = ref.current

		expect(takePending(ref)).toBe(taken)
		expect(ref.current).toBeNull()
	})

	// The whole point: a second pointerup in the same frame commits nothing
	it('yields nothing on a repeated take', () => {
		const ref = { current: preview({ type: 'rect', endX: 200 }) as ShapePreview | null }
		takePending(ref)
		expect(takePending(ref)).toBeNull()
	})

	it('is a no-op on an already empty slot', () => {
		const ref: { current: ShapePreview | null } = { current: null }
		expect(takePending(ref)).toBeNull()
		expect(ref.current).toBeNull()
	})
})

/**
 * The one policy question a closing editor asks. Escape, a click outside and Ctrl+Enter all mean
 * commit-and-step-out, so everything that survives a close is decided here. The asymmetry between
 * text and sticky is the point of the function, and the thing most likely to be "tidied up".
 */
describe('shouldRemoveOnEditEnd', () => {
	it('keeps what was typed - closing commits, it never discards', () => {
		expect(shouldRemoveOnEditEnd('text', 'hello')).toBe(false)
		expect(shouldRemoveOnEditEnd('sticky', 'hello')).toBe(false)
	})

	it('removes an empty text object, which would be an invisible click trap', () => {
		expect(shouldRemoveOnEditEnd('text', '')).toBe(true)
	})

	it('treats a Quill-empty document as empty', () => {
		// Quill keeps a trailing newline even when the user typed nothing
		expect(shouldRemoveOnEditEnd('text', '\n')).toBe(true)
		expect(shouldRemoveOnEditEnd('text', '  \n \t ')).toBe(true)
	})

	it('keeps an empty sticky - a blank coloured card is still visible', () => {
		expect(shouldRemoveOnEditEnd('sticky', '')).toBe(false)
		expect(shouldRemoveOnEditEnd('sticky', '\n')).toBe(false)
	})

	/*
	 * A labelled shape survives an empty close for the same reason a sticky does: the "at least
	 * one of stroke and fill" invariant in utils/paint.ts means a shape can never be cleared into
	 * invisibility, so a textless one is always something the user can see and grab.
	 */
	it('keeps a textless shape - it is visible with or without a label', () => {
		expect(shouldRemoveOnEditEnd('rect', '')).toBe(false)
		expect(shouldRemoveOnEditEnd('ellipse', '')).toBe(false)
		expect(shouldRemoveOnEditEnd('polygon', '')).toBe(false)
		expect(shouldRemoveOnEditEnd('rect', '\n')).toBe(false)
	})

	it('leaves every other object type alone', () => {
		expect(shouldRemoveOnEditEnd('image', '')).toBe(false)
		expect(shouldRemoveOnEditEnd('connector', '')).toBe(false)
	})
})

// vim: ts=4
