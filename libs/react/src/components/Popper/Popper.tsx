// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Popover } from '../Popover/Popover.js'
import type { Elevation } from '../types.js'

export interface PopperProps {
	className?: string
	menuClassName?: string
	contentClassName?: string
	elevation?: Elevation
	icon?: React.ReactNode
	label?: React.ReactNode
	'aria-label'?: string
	children?: React.ReactNode
}

/** @deprecated Use `Popover` with a Button `trigger`. Kept for app consumers. */
export function Popper({
	className,
	menuClassName,
	contentClassName,
	elevation = 'high',
	icon,
	label,
	'aria-label': ariaLabel,
	children
}: PopperProps) {
	const [isOpen, setIsOpen] = React.useState(false)

	return (
		// Portaled content bubbles through here in the React tree; keep it from rows behind
		<details className={className} open={isOpen} onClick={(evt) => evt.stopPropagation()}>
			<Popover
				open={isOpen}
				onOpenChange={setIsOpen}
				elevation={elevation}
				className={contentClassName}
				onClick={() => setIsOpen(false)}
				trigger={
					<summary
						className={menuClassName || 'c-nav-item g-2'}
						aria-label={ariaLabel}
						onClick={(evt) => evt.preventDefault()}
					>
						{icon}
						{label}
					</summary>
				}
			>
				{children}
			</Popover>
		</details>
	)
}

// vim: ts=4
