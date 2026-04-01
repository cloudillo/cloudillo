// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * PropertyGroupHeader - Reusable header for property groups with lock button
 */

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
