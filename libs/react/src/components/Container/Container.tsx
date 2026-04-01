// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses } from '../utils.js'

export interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
	className?: string
	children?: React.ReactNode
}

export function Container({ className, children, ...props }: ContainerProps) {
	return (
		<main className={mergeClasses('c-container h-100 overflow-y-auto', className)} {...props}>
			{children}
		</main>
	)
}

// vim: ts=4
