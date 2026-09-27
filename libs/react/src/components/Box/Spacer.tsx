// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface SpacerProps extends React.HTMLAttributes<HTMLDivElement> {}

/** Takes up the free space in a flex row/column, pushing its siblings apart */
export const Spacer = createComponent<HTMLDivElement, SpacerProps>(
	'Spacer',
	({ className, ...props }, ref) => (
		<div ref={ref} aria-hidden className={mergeClasses('c-spacer', className)} {...props} />
	)
)

// vim: ts=4
