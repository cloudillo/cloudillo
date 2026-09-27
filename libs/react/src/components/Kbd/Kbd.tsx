// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

/** A keyboard key or shortcut hint; add `coarse-hide` where touch users have no keyboard */
export type KbdProps = React.HTMLAttributes<HTMLElement>

export const Kbd = createComponent<HTMLElement, KbdProps>('Kbd', ({ className, ...props }, ref) => (
	<kbd ref={ref} className={mergeClasses('c-kbd', className)} {...props} />
))

// vim: ts=4
