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

/**
 * PropertyGroupHeader - Reusable header for property groups with lock button
 */

import * as React from 'react'
import { PropertyLockButton } from './PropertyLockButton'

export interface PropertyGroupHeaderProps {
	/** Label text for the property group */
	label: string
	/** Whether the object is a template instance */
	isInstance: boolean
	/** Whether the property group is locked (inheriting from prototype) */
	isLocked: boolean
	/** Callback to unlock the property group */
	onUnlock: () => void
	/** Callback to reset the property group to inherited state */
	onReset: () => void
	/** Additional CSS classes */
	className?: string
}

/**
 * Header component for property groups in the properties panel.
 * Shows a label and a lock/unlock button for template instances.
 *
 * @example
 * ```tsx
 * const position = useLockableProperty(yDoc, doc, objectId, 'position')
 *
 * <PropertyGroupHeader
 *   label="Position"
 *   isInstance={position.isInstance}
 *   isLocked={position.isLocked}
 *   onUnlock={position.handleUnlock}
 *   onReset={position.handleReset}
 * />
 * ```
 */
export function PropertyGroupHeader({
	label,
	isInstance,
	isLocked,
	onUnlock,
	onReset,
	className
}: PropertyGroupHeaderProps) {
	return (
		<div className={`c-hbox ai-center mb-1${className ? ` ${className}` : ''}`}>
			<span className="c-property-group-label">{label}</span>
			<PropertyLockButton
				isInstance={isInstance}
				isLocked={isLocked}
				onUnlock={onUnlock}
				onReset={onReset}
			/>
		</div>
	)
}

// vim: ts=4
