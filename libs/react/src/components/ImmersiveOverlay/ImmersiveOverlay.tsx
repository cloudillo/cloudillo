// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Modal } from '../Modal/Modal.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface ImmersiveOverlayProps extends React.HTMLAttributes<HTMLDialogElement> {
	open?: boolean
	/** Escape calls it; unset = blocking */
	onClose?: () => void
	/** Overlaid control bar (camera buttons, viewer navigation) */
	controls?: React.ReactNode
	children?: React.ReactNode
}

/**
 * Full-screen, always-dark stage for media (camera, viewer) on the native-dialog base.
 * No title bar: name it with `aria-label`; put buttons in `controls`.
 */
export const ImmersiveOverlay = createComponent<HTMLDialogElement, ImmersiveOverlayProps>(
	'ImmersiveOverlay',
	({ className, controls, children, ...props }, ref) => (
		<Modal
			ref={ref}
			closeOnBackdrop={false}
			className={mergeClasses('c-immersive', 'inverse', className)}
			{...props}
		>
			<div className="c-immersive-stage">{children}</div>
			{controls && <div className="c-immersive-controls">{controls}</div>}
		</Modal>
	)
)

// vim: ts=4
