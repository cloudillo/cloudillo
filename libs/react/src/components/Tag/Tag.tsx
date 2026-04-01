// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuX as IcClose } from 'react-icons/lu'
import { mergeClasses, createComponent } from '../utils.js'
import type { ColorVariant } from '../types.js'

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
	variant?: ColorVariant
	size?: 'small' | 'default' | 'large'
	onRemove?: () => void
	children?: React.ReactNode
}

export const Tag = createComponent<HTMLSpanElement, TagProps>(
	'Tag',
	({ className, variant, size, onRemove, children, ...props }, ref) => {
		return (
			<span
				ref={ref}
				className={mergeClasses(
					'c-tag',
					variant,
					size === 'small' && 'small',
					size === 'large' && 'large',
					onRemove && 'removable',
					className
				)}
				{...props}
			>
				{children}
				{onRemove && (
					<button
						type="button"
						className="c-tag-remove"
						onClick={(evt) => {
							evt.stopPropagation()
							onRemove()
						}}
						aria-label="Remove tag"
					>
						<IcClose size="0.8em" />
					</button>
				)}
			</span>
		)
	}
)

// vim: ts=4
