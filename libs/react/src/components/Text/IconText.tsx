// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface IconTextProps extends React.HTMLAttributes<HTMLSpanElement> {
	/** Decorative leading icon (aria-hidden) */
	icon: React.ReactNode
}

export const IconText = createComponent<HTMLSpanElement, IconTextProps>(
	'IconText',
	({ className, icon, children, ...props }, ref) => (
		<span ref={ref} className={mergeClasses('c-icon-text', className)} {...props}>
			<span className="c-icon-text-icon" aria-hidden="true">
				{icon}
			</span>
			{children}
		</span>
	)
)

// vim: ts=4
