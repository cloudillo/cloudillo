// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export type MetaProps = React.HTMLAttributes<HTMLSpanElement>

/** Muted secondary line; non-empty children are joined with " · ". */
export const Meta = createComponent<HTMLSpanElement, MetaProps>(
	'Meta',
	({ className, children, ...props }, ref) => (
		<span ref={ref} className={mergeClasses('c-meta', className)} {...props}>
			{React.Children.toArray(children).map((child, i) => (
				<React.Fragment key={React.isValidElement(child) ? child.key : i}>
					{i > 0 && (
						<span className="c-meta-sep" aria-hidden="true">
							{' · '}
						</span>
					)}
					{child}
				</React.Fragment>
			))}
		</span>
	)
)

// vim: ts=4
