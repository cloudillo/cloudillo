// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The gate between a raw window keydown and the editor's shortcuts (modelled on ideallo's).
 */

import { isEditableTarget as isEditableTargetIn } from '@cloudillo/canvas-tools'

/** One root class per prezillo popover / menu family, matched with `closest()` on the target. */
export const POPOVER_TARGET_SELECTOR = [
	'.c-context-menu',
	'.c-bullet-picker',
	'.c-bullet-dropdown',
	'.c-color-input-picker',
	'.c-slide-picker',
	'.c-symbol-picker',
	'.c-symbol-dropdown',
	'.c-theme-dropdown-popover',
	'.c-template-selector__dropdown',
	'.c-template-panel__menu',
	'.c-presenter-indicator__dropdown',
	'.c-present-split__dropdown'
].join(', ')

/**
 * Keys typed into an editor, a dialog or a popover are not shortcuts — not even modifier chords.
 */
export const isEditableTarget = (target: EventTarget | null) =>
	isEditableTargetIn(target, POPOVER_TARGET_SELECTOR)

// vim: ts=4
