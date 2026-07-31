// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The tool lock's REACH: on desktop the four shape tools are never rendered as tool buttons of
 * their own - they live behind the shape group trigger - so unless that trigger takes the gesture
 * and wears the badge on their behalf, the tools the lock exists for cannot be locked at all.
 *
 * Rendered rather than unit-tested because that is exactly what broke: `canKeepActive` was right
 * the whole time, and nothing was wired to it.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { Toolbar, type ToolbarProps } from '../components/Toolbar.js'
import type { ToolType } from '../tools/index.js'

function setViewport(mobile: boolean) {
	// jsdom implements no matchMedia at all, and useIsMobile calls it during the first render
	window.matchMedia = ((query: string) => ({
		matches: mobile,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false
	})) as unknown as typeof window.matchMedia
}

// An open popover measures itself through useEdgeClamp, which observes its own element
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

interface Rendered {
	locks: boolean[]
}

function baseProps(): ToolbarProps {
	return {
		activeTool: 'select' as ToolType,
		canUndo: false,
		canRedo: false,
		hasSelection: false,
		toolLocked: false,
		onToolChange: () => {},
		onToolLockChange: () => {},
		onUndo: () => {},
		onRedo: () => {},
		onExport: () => {},
		onBringToFront: () => {},
		onBringForward: () => {},
		onSendBackward: () => {},
		onSendToBack: () => {}
	}
}

function renderToolbar(over: Partial<ToolbarProps> = {}): Rendered {
	const locks: boolean[] = []
	render(
		<Toolbar
			{...baseProps()}
			onToolLockChange={(locked) => {
				locks.push(locked)
			}}
			{...over}
		/>
	)
	return { locks }
}

/**
 * Feeds `activeTool` back from the toolbar's own callback. A gesture that arms a tool on its way
 * through - which a click on a group trigger does - is only visible to the NEXT render, so a fixed
 * prop cannot model it.
 */
function renderLiveToolbar(initial: ToolType): Rendered {
	const locks: boolean[] = []
	function Harness() {
		const [activeTool, setActiveTool] = React.useState<ToolType>(initial)
		return (
			<Toolbar
				{...baseProps()}
				activeTool={activeTool}
				onToolChange={setActiveTool}
				onToolLockChange={(locked) => {
					locks.push(locked)
				}}
			/>
		)
	}
	render(<Harness />)
	return { locks }
}

// A regex, not the bare category: while a shape is armed the trigger stands in for it and says so,
// so its accessible name is "Rectangle (Shapes)" - see the naming test at the bottom of this file
const shapeTrigger = () => screen.getByRole('button', { name: /Shapes/ })

beforeEach(() => {
	setViewport(false)
	globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof globalThis.ResizeObserver
})

describe('the shape group trigger as a lockable tool', () => {
	it('toggles the lock on a double-click while a shape is armed', () => {
		const { locks } = renderToolbar({ activeTool: 'ellipse' })
		fireEvent.dblClick(shapeTrigger())
		expect(locks).toEqual([true])
	})

	it('releases the lock on a second double-click', () => {
		const { locks } = renderToolbar({ activeTool: 'ellipse', toolLocked: true })
		fireEvent.dblClick(shapeTrigger())
		expect(locks).toEqual([false])
	})

	// A PROPS-level guarantee, not a claim about the gesture: while no member of the group is armed
	// the trigger stands in for no tool, so it hands down no dblclick handler at all - the same rule
	// ToolButton applies to pen, eraser, image and document. The stateful case is below.
	it('offers no lock gesture while no member of the group is armed', () => {
		const { locks } = renderToolbar({ activeTool: 'select' })
		fireEvent.dblClick(shapeTrigger())
		expect(locks).toEqual([])
	})

	/*
	 * A real double-click is click, click, dblclick. Click 1 opens the flyout AND arms the
	 * remembered shape (Toolbar.tsx's onToggle), so the dblclick lands on a trigger that by then
	 * DOES stand in for a tool. Reaching the lock from Select therefore takes one gesture, not two.
	 */
	it('arms the remembered shape and locks it, in one double-click from Select', () => {
		const { locks } = renderLiveToolbar('select')
		const trigger = shapeTrigger()
		fireEvent.click(trigger)
		fireEvent.click(trigger)
		fireEvent.dblClick(trigger)
		expect(locks).toEqual([true])
	})

	it('wears the badge while its armed member is kept', () => {
		renderToolbar({ activeTool: 'rect', toolLocked: true })
		expect(shapeTrigger().querySelector('.ideallo-tool-kept')).not.toBeNull()
	})

	it('wears no badge when the armed tool is not one of its own', () => {
		renderToolbar({ activeTool: 'select', toolLocked: true })
		expect(shapeTrigger().querySelector('.ideallo-tool-kept')).toBeNull()
	})

	it('advertises both routes to the lock in its tooltip', () => {
		renderToolbar({ activeTool: 'rect' })
		expect(shapeTrigger().getAttribute('title')).toContain('double-click or Q to keep active')
	})
})

describe('the overflow menu row', () => {
	it('names the Q shortcut alongside the mode', () => {
		renderToolbar()
		fireEvent.click(screen.getByRole('button', { name: 'More' }))
		const row = screen.getByRole('menuitemcheckbox', { name: /Keep tool active/ })
		expect(row.querySelector('.ideallo-tool-menu-shortcut')?.textContent).toBe('Q')
	})
})

describe('mobile', () => {
	it('badges the Tools trigger, which is the armed shape’s only home in that bar', () => {
		setViewport(true)
		renderToolbar({ activeTool: 'rect', toolLocked: true })
		const trigger = screen.getByRole('button', { name: /Tools/ })
		expect(trigger.querySelector('.ideallo-tool-kept')).not.toBeNull()
	})

	// Pen and eraser are always armed, so the lock has nothing to keep
	it('never badges the Draw trigger', () => {
		setViewport(true)
		renderToolbar({ activeTool: 'pen', toolLocked: true })
		const trigger = screen.getByRole('button', { name: /Draw/ })
		expect(trigger.querySelector('.ideallo-tool-kept')).toBeNull()
	})
})

/**
 * The trigger arms its last-used member as a side effect of opening - which is wanted, and saves a
 * click - so the two things that make it discoverable and reversible are asserted here.
 */
describe('the group trigger standing in for a tool', () => {
	it('names the armed member, not just the category', () => {
		renderToolbar({ activeTool: 'rect' })
		expect(shapeTrigger().getAttribute('aria-label')).toBe('Rectangle (Shapes)')
	})

	it('names only the category while no member is armed', () => {
		renderToolbar({ activeTool: 'select' })
		expect(shapeTrigger().getAttribute('aria-label')).toBe('Shapes')
	})

	it('says in its tooltip that the flyout holds the alternatives', () => {
		renderToolbar({ activeTool: 'rect' })
		expect(shapeTrigger().getAttribute('title')).toBe(
			'Rectangle · Shapes (click for others) · double-click or Q to keep active'
		)
	})

	it('reverts the tool it armed when the flyout is escaped', () => {
		const tools: ToolType[] = []
		function Harness() {
			const [activeTool, setActiveTool] = React.useState<ToolType>('select')
			return (
				<Toolbar
					{...baseProps()}
					activeTool={activeTool}
					onToolChange={(tool) => {
						tools.push(tool)
						setActiveTool(tool)
					}}
				/>
			)
		}
		render(<Harness />)
		fireEvent.click(shapeTrigger())
		expect(tools).toEqual(['rect'])

		fireEvent.keyDown(document, { key: 'Escape' })
		expect(tools).toEqual(['rect', 'select'])
		expect(screen.queryByRole('menu', { name: 'Shapes' })).toBeNull()
	})

	// An outside click is a dismissal, not a cancellation: the arming stands
	it('keeps the armed tool when the flyout is dismissed by a click outside', () => {
		const tools: ToolType[] = []
		function Harness() {
			const [activeTool, setActiveTool] = React.useState<ToolType>('select')
			return (
				<Toolbar
					{...baseProps()}
					activeTool={activeTool}
					onToolChange={(tool) => {
						tools.push(tool)
						setActiveTool(tool)
					}}
				/>
			)
		}
		render(<Harness />)
		fireEvent.click(shapeTrigger())
		fireEvent.pointerDown(document.body)

		expect(tools).toEqual(['rect'])
		expect(screen.queryByRole('menu', { name: 'Shapes' })).toBeNull()
	})
})

// vim: ts=4
