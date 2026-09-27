// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface ColorDotProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> {
	/** A user-chosen colour: any CSS colour, e.g. `var(--palette-red)` or `#e33`. */
	color: string
	size?: 'sm' | 'md' | 'lg'
	/** Names the colour for screen readers; without it the dot is decorative. */
	'aria-label'?: string
}

/** Swatch for a user-chosen colour only. Status/tone dots are `<Badge dot>`. */
export const ColorDot = createComponent<HTMLSpanElement, ColorDotProps>(
	'ColorDot',
	({ className, color, size, style, ...props }, ref) => {
		return (
			<span
				ref={ref}
				role={props['aria-label'] ? 'img' : undefined}
				aria-hidden={props['aria-label'] ? undefined : true}
				className={mergeClasses('c-color-dot', size !== 'md' && size, className)}
				style={{ ...style, '--dot-color': color } as React.CSSProperties}
				{...props}
			/>
		)
	}
)

// vim: ts=4
