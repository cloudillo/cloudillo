// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'

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
 * @deprecated Use `Dialog`. `Modal` stays as the internal base.
 */
export const Modal = createComponent<HTMLDialogElement, ModalProps>(
	'Modal',
	({ className, open, onClose, closeOnBackdrop = true, elevation, children, ...props }, ref) => {
		const dialogRef = React.useRef<HTMLDialogElement>(null)
		const onCloseRef = React.useRef(onClose)
		onCloseRef.current = onClose

		useBodyScrollLock(!!open)

		React.useLayoutEffect(() => {
			const dialog = dialogRef.current
			if (!open || !dialog) return
			// jsdom has no showModal()
			if (typeof dialog.showModal === 'function') dialog.showModal()
			else dialog.setAttribute('open', '')

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

// vim: ts=4
