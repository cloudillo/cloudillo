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
			{React.Children.toArray(children).map((child, i) => {
				const key = React.isValidElement(child) ? child.key : i
				if (i === 0) return <React.Fragment key={key}>{child}</React.Fragment>
				// Separator wraps together with its item, never dangling at a line end
				return (
					<span key={key} className="c-meta-item">
						<span className="c-meta-sep" aria-hidden="true">
							{' · '}
						</span>
						{child}
					</span>
				)
			})}
		</span>
	)
)

// vim: ts=4
