// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ColorVariant } from '../types.js'
import { createComponent, mergeClasses, polyRef } from '../utils.js'

export type TextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl'
export type TextEmphasis = 'muted' | 'disabled' | 'strong'
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold'

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
	as?: 'span' | 'p' | 'div' | 'label'
	size?: TextSize
	color?: ColorVariant
	emphasis?: TextEmphasis
	weight?: TextWeight
	/** `true` = one-line ellipsis, a number = line clamp */
	truncate?: boolean | 2 | 3 | 4
	align?: 'left' | 'center' | 'right' | 'justify'
	mono?: boolean
	preWrap?: boolean
	/** Only meaningful with `as="label"` */
	htmlFor?: string
}

const EMPHASIS_CLASS: Record<TextEmphasis, string> = {
	muted: 'text-muted',
	disabled: 'text-disabled',
	strong: 'text-emph'
}

export const Text = createComponent<HTMLElement, TextProps>(
	'Text',
	(
		{
			as: Tag = 'span',
			className,
			size,
			color,
			emphasis,
			weight,
			truncate,
			align,
			mono,
			preWrap,
			...props
		},
		ref
	) => {
		return (
			<Tag
				ref={polyRef(ref)}
				className={mergeClasses(
					size && `text-${size}`,
					color && `text-${color}`,
					emphasis && EMPHASIS_CLASS[emphasis],
					weight && `font-${weight}`,
					truncate === true && 'text-truncate',
					typeof truncate === 'number' && `text-clamp-${truncate}`,
					align && `text-${align}`,
					mono && 'font-mono',
					preWrap && 'ws-pre-wrap',
					className
				)}
				{...props}
			/>
		)
	}
)

// vim: ts=4
