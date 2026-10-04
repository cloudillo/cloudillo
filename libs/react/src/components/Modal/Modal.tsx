// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'

import { trackInputModality } from '../Popover/Popover.js'
import { mergeRefs } from '../Tooltip/Tooltip.js'
import { useBodyScrollLock } from '../hooks.js'
import type { Elevation } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface ModalProps extends React.HTMLAttributes<HTMLDialogElement> {
	open?: boolean
	/** Escape (and a backdrop click, unless `closeOnBackdrop` is false) calls it. Unset = blocking. */
	onClose?: () => void
	closeOnBackdrop?: boolean
	elevation?: Elevation
	children?: React.ReactNode
}

/**
 * Native `<dialog>` opened with `showModal()`: top layer, focus trap, inert background.
 * The dialog element itself is the full-screen backdrop; `children` is the panel.
 * Base for `Dialog` (and the sheet/overlay components).
 *
 * The dialog opens in its first child's ref callback, before the children's `autoFocus` runs. Without one, focus goes to
 * the first form field (fine pointer only, so phones don't pop the keyboard), else the first
 * focusable outside the header close button, else the dialog itself.
 *
 * @deprecated Use `Dialog`. `Modal` stays as the internal base.
 */
export const Modal = createComponent<HTMLDialogElement, ModalProps>(
	'Modal',
	({ className, open, onClose, closeOnBackdrop = true, elevation, children, ...props }, ref) => {
		const dialogRef = React.useRef<HTMLDialogElement>(null)
		const onCloseRef = React.useRef(onClose)
		onCloseRef.current = onClose

		useBodyScrollLock(!!open)
		React.useEffect(() => {
			trackInputModality()
		}, [])

		React.useLayoutEffect(() => {
			const dialog = dialogRef.current
			if (!open || !dialog) return
			function onCancel(evt: Event) {
				// The parent owns `open`; an open popover inside takes Escape first (close watcher)
				evt.preventDefault()
				onCloseRef.current?.()
			}
			// Chrome may force-close on a repeated Escape despite preventDefault()
			function onNativeClose() {
				if (onCloseRef.current) onCloseRef.current()
				else if (dialog && typeof dialog.showModal === 'function') dialog.showModal()
			}
			dialog.addEventListener('cancel', onCancel)
			dialog.addEventListener('close', onNativeClose)
			return () => {
				dialog.removeEventListener('cancel', onCancel)
				dialog.removeEventListener('close', onNativeClose)
				// Closing (rather than just unmounting) returns focus to the opener
				if (dialog.open && typeof dialog.close === 'function') dialog.close()
			}
		}, [open])

		// Runs after the children's commit-time autoFocus
		React.useLayoutEffect(() => {
			const dialog = dialogRef.current
			if (!open || !dialog) return
			const active = document.activeElement
			if (active && active !== dialog && dialog.contains(active)) return
			focusFallback(dialog)
		}, [open])

		if (!open) return null

		function handleBackdropClick(evt: React.MouseEvent<HTMLDialogElement>) {
			if (evt.target === evt.currentTarget && closeOnBackdrop && onClose) {
				onClose()
			}
		}

		const modalContent = (
			<dialog
				ref={mergeRefs(dialogRef, ref)}
				className={mergeClasses('c-modal', 'show', elevation, className)}
				onClick={handleBackdropClick}
				{...props}
			>
				<span hidden ref={openParent} />
				{children}
			</dialog>
		)

		// Portal to document body
		if (typeof document !== 'undefined') {
			return createPortal(modalContent, document.body)
		}

		return modalContent
	}
)

// Opens the dialog in the ref phase, before later siblings' autoFocus runs (same commit).
// Relies on React's depth-first layout-phase ordering (stable through React 19.3).
function openParent(el: HTMLSpanElement | null) {
	const dialog = el?.parentElement as HTMLDialogElement | null
	if (!dialog || dialog.open) return
	if (typeof dialog.showModal === 'function') dialog.showModal()
	else dialog.setAttribute('open', '') // jsdom
}

const FIELD_SELECTOR =
	'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function focusFallback(dialog: HTMLDialogElement) {
	const finePointer =
		typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
	const field = finePointer ? dialog.querySelector<HTMLElement>(FIELD_SELECTOR) : null
	const target =
		field ??
		Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).find(
			(el) => !el.closest('.c-dialog-header')
		)
	if (target) {
		target.focus()
	} else {
		dialog.tabIndex = -1
		dialog.focus()
	}
}

// vim: ts=4
