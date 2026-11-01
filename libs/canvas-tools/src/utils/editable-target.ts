// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Keys typed into an editor, a dialog or a popover are not shortcuts — not even modifier chords.
 *
 * Matched with `closest()` against the event TARGET. `popoverSelector` is the app's own list of
 * popover / menu root classes.
 */
export function isEditableTarget(target: EventTarget | null, popoverSelector = ''): boolean {
	const el = target as HTMLElement | null
	if (!el || typeof el.closest !== 'function') return false
	if (el.isContentEditable) return true
	const tag = el.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
	const base = '[data-rich-text-editor], dialog[open], [role="dialog"]'
	return Boolean(el.closest(popoverSelector ? `${base}, ${popoverSelector}` : base))
}

// vim: ts=4
