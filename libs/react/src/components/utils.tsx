// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { Link } from 'react-router-dom'
import {
	LuSmile as EmSmile,
	LuLaugh as EmLaugh,
	LuFrown as EmSad,
	LuMeh as EmMeh,
	LuHeart as EmHeart
} from 'react-icons/lu'

/**
 * Merge CSS class names, filtering out falsy values
 */
export function mergeClasses(...classes: (string | false | undefined | null)[]): string {
	return classes.filter(Boolean).join(' ')
}

/**
 * Create a forwardRef component with displayName
 */
export function createComponent<T, P>(
	displayName: string,
	render: (props: P, ref: React.ForwardedRef<T>) => React.ReactNode
): React.ForwardRefExoticComponent<P & React.RefAttributes<T>> {
	// Cast to any to avoid TypeScript's strict forwardRef signature
	const Component = React.forwardRef(render as any) as unknown as React.ForwardRefExoticComponent<
		P & React.RefAttributes<T>
	>
	Component.displayName = displayName
	return Component
}

/**
 * Generate unique IDs for accessibility
 */
let idCounter = 0
export function useId(prefix = 'cl'): string {
	const [id] = React.useState(() => `${prefix}-${++idCounter}`)
	return id
}

/**
 * Convert size prop to CSS class for buttons
 */
export function buttonSizeClass(
	size: 'compact' | 'small' | 'default' | 'large' | undefined
): string | undefined {
	if (size === 'compact') return 'compact'
	if (size === 'small') return 'small'
	if (size === 'large') return 'large'
	return undefined
}

/**
 * Convert avatar size prop to CSS class
 */
export function avatarSizeClass(
	size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined
): string | undefined {
	return size
}

/**
 * Emoji mappings for text fragment generation
 */
const emojis: Record<string, React.ReactNode> = {
	':)': <EmSmile size="1em" />,
	':D': <EmLaugh size="1em" />,
	':P': '😛',
	';P': '😜',
	':|': <EmMeh size="1em" />,
	':(': <EmSad size="1em" />,
	'<3': <EmHeart size="1em" />,
	'::': <img src="https://w9.hu/w9.png" />
}

/**
 * Generate React fragments from text with links, hashtags, and emoji support
 */
export function generateFragments(text: string): React.ReactNode[] {
	const fragments: React.ReactNode[] = []

	for (const w of text.split(/(\s+)/)) {
		let n: React.ReactNode = w

		switch (w[0]) {
			case 'h':
				if (w.match(/^https?:\/\//)) {
					if (w.startsWith(`https://${window.location.host}/`)) {
						n = <Link to={w.replace(`https://${window.location.host}/`, '/')}>{w}</Link>
					} else {
						n = (
							<a href={w} target="_blank">
								{w}
							</a>
						)
					}
				}
				break
			case '#':
				if (w.match(/^#\S+/)) {
					n = <span className="c-tag">{w}</span>
				}
				break
			case ':':
			case ';':
			case '<':
			case '8':
				const emoji = emojis[w]
				if (typeof emoji == 'object') {
					n = (
						<span>
							{emojis[w]}
							<span
								className="d-inline-block"
								style={{ width: 0, overflow: 'hidden' }}
							>
								{w}
							</span>
						</span>
					)
				} else {
					n = emoji || w
				}
				break
		}
		const last = fragments[fragments.length - 1]
		if (typeof n == 'string' && typeof last == 'string') {
			fragments[fragments.length - 1] = last + n
		} else {
			fragments.push(n)
		}
	}
	return fragments
}

// vim: ts=4
