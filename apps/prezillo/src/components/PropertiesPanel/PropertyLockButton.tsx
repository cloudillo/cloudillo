// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import {
	PiLockSimpleFill as IcLocked,
	PiArrowCounterClockwiseBold as IcReset
} from 'react-icons/pi'

export interface PropertyLockButtonProps {
	/** Whether this object is an instance of a template */
	isInstance: boolean
	/** Whether the property group is currently locked (inheriting from prototype) */
	isLocked: boolean
	/** Callback when user wants to unlock (copy prototype value and make editable) */
	onUnlock: () => void
	/** Callback when user wants to reset (clear override and return to locked) */
	onReset: () => void
	/** Label for the property group (e.g., "Position", "Size") */
	label?: string
}

/**
 * Lock/Unlock button for template instance properties
 *
 * Visual states:
 * - Non-instance: Nothing shown (normal editing)
 * - Locked (inherited): Lock icon, click to unlock
 * - Unlocked (overridden): Unlock icon + reset button
 */
export function PropertyLockButton({
	isInstance,
	isLocked,
	onUnlock,
	onReset,
	label
}: PropertyLockButtonProps) {
	// Don't show anything for non-instance objects
	if (!isInstance) {
		return null
	}

	return (
		<div className="c-property-lock">
			{label && <span className="c-property-lock__label">{label}</span>}
			{isLocked ? (
				<button
					type="button"
					className="c-property-lock__btn c-property-lock__btn--locked"
					onClick={onUnlock}
					title="Click to unlock and edit"
				>
					<IcLocked />
				</button>
			) : (
				<button
					type="button"
					className="c-property-lock__btn c-property-lock__btn--reset"
					onClick={onReset}
					title="Reset to template value"
				>
					<IcReset />
				</button>
			)}
		</div>
	)
}

/**
 * Hook for managing property group lock state
 */
export function usePropertyLock(
	isInstance: boolean,
	isLocked: boolean,
	onUnlock: () => void,
	onReset: () => void
) {
	const handleUnlock = React.useCallback(() => {
		if (isLocked) {
			onUnlock()
		}
	}, [isLocked, onUnlock])

	const handleReset = React.useCallback(() => {
		if (!isLocked) {
			onReset()
		}
	}, [isLocked, onReset])

	return {
		isInstance,
		isLocked,
		isEditable: !isInstance || !isLocked,
		handleUnlock,
		handleReset
	}
}

// vim: ts=4
