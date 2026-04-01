// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses } from '../utils.js'

export interface FcdContainerProps {
	className?: string
	children?: React.ReactNode
}

export function FcdContainer({ className, children }: FcdContainerProps) {
	return (
		<main className={mergeClasses('c-container w-100 h-100', className)}>
			<div className="row h-100">{children}</div>
		</main>
	)
}

// vim: ts=4
