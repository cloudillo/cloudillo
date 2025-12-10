// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
