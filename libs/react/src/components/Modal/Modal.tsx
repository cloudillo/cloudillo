// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { mergeClasses, createComponent } from '../utils.js'
import { useBodyScrollLock, useEscapeKey } from '../hooks.js'
import type { Elevation } from '../types.js'

export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
	open?: boolean
	onClose?: () => void
	closeOnBackdrop?: boolean
	elevation?: Elevation
	children?: React.ReactNode
}

export const Modal = createComponent<HTMLDivElement, ModalProps>(
	'Modal',
	({ className, open, onClose, closeOnBackdrop = true, elevation, children, ...props }, ref) => {
		// Close on escape key using shared hook
		useEscapeKey(onClose || (() => {}), !!open && !!onClose)

		// Prevent body scroll when modal is open using shared hook
		useBodyScrollLock(!!open)

		if (!open) return null

		function handleBackdropClick(evt: React.MouseEvent) {
			if (evt.target === evt.currentTarget && closeOnBackdrop && onClose) {
				onClose()
			}
		}

		const modalContent = (
			<div
				ref={ref}
				className={mergeClasses('c-modal', open && 'show', elevation, className)}
				role="dialog"
				aria-modal="true"
				onClick={handleBackdropClick}
				{...props}
			>
				{children}
			</div>
		)

		// Portal to document body
		if (typeof document !== 'undefined') {
			return createPortal(modalContent, document.body)
		}

		return modalContent
	}
)

// vim: ts=4
