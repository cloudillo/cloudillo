// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The gate between a raw window keydown and the app's shortcuts, in two tiers.
 *
 * Its own module rather than a local in app.tsx so it can be tested against a real DOM without
 * mounting the whole editor.
 */

/**
 * Matched with `closest()` against the keydown TARGET, so a plain '.c-action-sheet' is right here:
 * a target inside a sheet is inside it whether or not the sheet is mid-animation.
 *
 * One shared class per popover family, so a new panel cannot be forgotten in the guards below.
 */
export const POPOVER_TARGET_SELECTOR =
	'.ideallo-bar-popover, .ideallo-tool-popover, .c-font-picker__menu, .c-action-sheet'

/**
 * Matched with `querySelector()` against the whole DOCUMENT, so it must be true only while a panel
 * is actually OPEN. ActionSheet stays mounted for its 300ms exit animation and only drops `show` on
 * close, so a bare `.c-action-sheet` here would suppress the tool letters for a third of a second
 * after the sheet was dismissed.
 */
export const POPOVER_PRESENCE_SELECTOR =
	'.ideallo-bar-popover, .ideallo-tool-popover, .c-font-picker__menu, .c-action-sheet.show'

/**
 * Keys typed into an editor are not shortcuts.
 *
 * The Quill editors stop React propagation but not the native event, so the window listener sees
 * every keystroke inside a sticky. This is the TARGET-based tier and it blocks EVERY shortcut: a
 * keystroke aimed at a text field must never also be a command.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null
	if (!el || typeof el.closest !== 'function') return false
	if (el.isContentEditable) return true
	const tag = el.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
	return Boolean(
		el.closest(`[data-rich-text-editor], [role="dialog"], ${POPOVER_TARGET_SELECTOR}`)
	)
}

/**
 * Whether a popover is open anywhere, regardless of where focus sits.
 *
 * The PRESENCE-based tier, and deliberately narrower than the target one: it suppresses only the
 * shortcuts that would act on the panel's own context - the tool letters, Enter/F2 and Escape.
 * Firing a tool switch out from under an open panel is never wanted, and Escape belongs to the
 * panel. Undo, duplicate, delete and zoom stay live, because a panel that only nudges a stroke
 * width stays open on purpose and used to leave them dead until it was dismissed.
 *
 * Presence rather than `closest()` because a popover renders as a SIBLING of its trigger and may
 * not take focus at all, which leaves the keydown target outside itself.
 */
export function isPopoverOpen(): boolean {
	if (typeof document === 'undefined') return false
	return Boolean(document.querySelector(POPOVER_PRESENCE_SELECTOR))
}

// vim: ts=4
