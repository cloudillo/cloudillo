// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shortcut gate, in two tiers.
 *
 * `isEditableTarget` is TARGET-based and blocks every shortcut - a keystroke typed into a Quill
 * editor or the hex field is never a shortcut. `isPopoverOpen` is PRESENCE-based and blocks only
 * the tool letters, Enter/F2 and Escape: its interesting case is the one that used to leak, a
 * popover rendered as a SIBLING of its trigger with focus still on the trigger, so
 * `closest('.ideallo-bar-popover')` from the keydown target was null and `r` switched the tool out
 * from under an open fill palette.
 */

import { isEditableTarget, isPopoverOpen } from '../utils/editable-target.js'

function reset() {
	document.body.innerHTML = ''
}

describe('isEditableTarget', () => {
	beforeEach(reset)
	afterEach(reset)

	it('gates on a target INSIDE an open popover', () => {
		document.body.innerHTML = `
			<div class="ideallo-property-group">
				<button id="swatch" type="button"></button>
				<div class="ideallo-bar-popover"><button id="red" type="button">Red</button></div>
			</div>
		`
		expect(isEditableTarget(document.getElementById('red'))).toBe(true)
	})

	/**
	 * The presence check deliberately does NOT live here any more: it suppressed undo, duplicate,
	 * delete and zoom for as long as a panel was open, and a panel that only changes a stroke width
	 * stays open on purpose.
	 */
	it('lets a target OUTSIDE an open popover through', () => {
		document.body.innerHTML = `
			<div class="ideallo-property-group">
				<button id="swatch" type="button"></button>
				<div class="ideallo-bar-popover"><button type="button">Red</button></div>
			</div>
		`
		const trigger = document.getElementById('swatch') as HTMLButtonElement
		// The trigger is OUTSIDE the popover in the DOM - the whole point of the presence check,
		// which is now isPopoverOpen's job rather than this one's
		expect(trigger.closest('.ideallo-bar-popover')).toBeNull()
		expect(isEditableTarget(trigger)).toBe(false)
	})

	it('lets shortcuts through on the bare canvas', () => {
		document.body.innerHTML = '<svg id="canvas"></svg>'
		expect(isEditableTarget(document.getElementById('canvas'))).toBe(false)
	})

	it('still gates on the target for text entry and dialogs', () => {
		document.body.innerHTML = `
			<input id="num" type="number" />
			<div role="dialog"><span id="in-dialog"></span></div>
			<div data-rich-text-editor><span id="in-editor"></span></div>
		`
		expect(isEditableTarget(document.getElementById('num'))).toBe(true)
		expect(isEditableTarget(document.getElementById('in-dialog'))).toBe(true)
		expect(isEditableTarget(document.getElementById('in-editor'))).toBe(true)
		// isContentEditable is deliberately not asserted: jsdom does not implement it, so the
		// contenteditable arm of the guard is only exercised in a real browser.
	})

	it('returns false for a null target with nothing open', () => {
		expect(isEditableTarget(null)).toBe(false)
	})
})

describe('isPopoverOpen', () => {
	beforeEach(reset)
	afterEach(reset)

	it('is false with nothing open', () => {
		document.body.innerHTML = '<svg id="canvas"></svg>'
		expect(isPopoverOpen()).toBe(false)
	})

	it.each([
		['bar popover', 'ideallo-bar-popover'],
		['tool flyout', 'ideallo-tool-popover'],
		['portalled font picker menu', 'c-font-picker__menu']
	])('is true for the %s', (_label, cls) => {
		document.body.innerHTML = `<div class="${cls}"></div>`
		expect(isPopoverOpen()).toBe(true)
	})

	/**
	 * ActionSheet stays MOUNTED for its 300ms exit animation and only drops `show` on close, so a
	 * bare `.c-action-sheet` would suppress every shortcut for a third of a second after the sheet
	 * was dismissed.
	 */
	it('ignores a closing action sheet and matches an open one', () => {
		document.body.innerHTML = '<div id="sheet" class="c-action-sheet"></div>'
		expect(isPopoverOpen()).toBe(false)
		document.getElementById('sheet')?.classList.add('show')
		expect(isPopoverOpen()).toBe(true)
	})
})

// vim: ts=4
