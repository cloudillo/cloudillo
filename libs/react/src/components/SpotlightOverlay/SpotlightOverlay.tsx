// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Modal } from '../Modal/Modal.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface SpotlightOverlayProps extends React.HTMLAttributes<HTMLDialogElement> {
	open?: boolean
	/** Escape calls it; unset = blocking */
	onClose?: () => void
	/** Viewport rect of the hole; null = no hole, the dim covers everything */
	spot: { top: number; left: number; width: number; height: number } | null
	children?: React.ReactNode
}

/** No spot: a zero-size hole at the center, so the dim covers everything. */
const CENTER = { top: '50%', left: '50%', width: 0, height: 0 }

/** Native modal layer whose only dim is a spotlight around `spot`; children float freely (tour bubbles). */
export const SpotlightOverlay = createComponent<HTMLDialogElement, SpotlightOverlayProps>(
	'SpotlightOverlay',
	({ className, spot, children, ...props }, ref) => (
		<Modal
			ref={ref}
			closeOnBackdrop={false}
			className={mergeClasses('c-spotlight', className)}
			{...props}
		>
			<div className="c-spotlight-spot" style={spot ?? CENTER} />
			{children}
		</Modal>
	)
)

// vim: ts=4
