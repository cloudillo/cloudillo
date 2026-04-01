// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import type { ColorVariant } from '../types.js'
import { delay } from '@cloudillo/core'

export interface LinkButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ColorVariant
	children?: React.ReactNode
}

export const LinkButton = createComponent<HTMLButtonElement, LinkButtonProps>(
	'LinkButton',
	({ className, type = 'button', onClick, variant, children, ...props }, ref) => {
		const [clicked, setClicked] = React.useState(false)

		async function handleClick(evt: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
			evt.preventDefault()
			setClicked(true)
			await delay(200)
			setClicked(false)
			if (type === 'submit') {
				;(evt.target as HTMLButtonElement).form?.requestSubmit()
			} else {
				onClick?.(evt)
			}
		}

		return (
			<button
				ref={ref}
				className={mergeClasses('c-link', variant, clicked && 'clicked', className)}
				type={type}
				onClick={handleClick}
				{...props}
			>
				{children}
			</button>
		)
	}
)

// vim: ts=4
