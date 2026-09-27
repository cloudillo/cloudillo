// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export type VisuallyHiddenProps = React.HTMLAttributes<HTMLSpanElement>

/** Content for screen readers only */
export const VisuallyHidden = createComponent<HTMLSpanElement, VisuallyHiddenProps>(
	'VisuallyHidden',
	({ className, ...props }, ref) => {
		return <span ref={ref} className={mergeClasses('sr-only', className)} {...props} />
	}
)

// vim: ts=4
