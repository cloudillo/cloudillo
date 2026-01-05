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
import {
	PiLockSimpleFill as IcLocked,
	PiLockSimpleOpenBold as IcUnlocked,
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
					title="Unlock to edit (currently inheriting from template)"
				>
					<IcLocked />
				</button>
			) : (
				<>
					<button
						type="button"
						className="c-property-lock__btn c-property-lock__btn--unlocked"
						onClick={onUnlock}
						title="Property is unlocked (override active)"
						disabled
					>
						<IcUnlocked />
					</button>
					<button
						type="button"
						className="c-property-lock__btn c-property-lock__btn--reset"
						onClick={onReset}
						title="Reset to template value"
					>
						<IcReset />
					</button>
				</>
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
