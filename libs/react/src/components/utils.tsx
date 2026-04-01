// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link } from 'react-router-dom'

/**
 * Merge CSS class names, filtering out falsy values
 */
export function mergeClasses(...classes: (string | false | undefined | null)[]): string {
	return classes.filter(Boolean).join(' ')
}

/**
 * Cast a polymorphic ref to satisfy React's strict ref type checking.
 * `never` is the bottom type, safely assignable to all ref types.
 */
export function polyRef<T>(ref: React.ForwardedRef<T>): React.Ref<never> {
	return ref as React.Ref<never>
}

/**
 * Resolve CJS/ESM interop for default exports.
 * Some modules wrap their default export in a `.default` property.
 */
export function resolveDefaultExport<T>(mod: T): T {
	const m = mod as T & { default?: T }
	return m.default ?? mod
}

/**
 * Create a forwardRef component with displayName
 */
export function createComponent<T, P>(
	displayName: string,
	render: (props: P, ref: React.ForwardedRef<T>) => React.ReactNode
): React.ForwardRefExoticComponent<P & React.RefAttributes<T>> {
	const Component = React.forwardRef(
		render as (props: Record<string, unknown>, ref: React.Ref<unknown>) => React.ReactNode
	) as unknown as React.ForwardRefExoticComponent<P & React.RefAttributes<T>>
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
const emojis: Record<string, string> = {
	':)': '😊',
	';)': '😉',
	':D': '😄',
	XD: '🤣',
	':P': '😛',
	';P': '😜',
	':|': '😐',
	':/': '😕',
	':(': '😢',
	":'(": '😭',
	':O': '😮',
	'<3': '❤️'
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
							<a href={w} target="_blank" rel="noopener noreferrer">
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
			case 'X': {
				const emoji = emojis[w]
				if (emoji) n = emoji
				break
			}
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

/**
 * Component to render formatted text with paragraphs, line breaks, links, hashtags, and emojis
 */
export interface FormattedTextProps {
	content: string
	className?: string
}

export function FormattedText({ content, className }: FormattedTextProps) {
	if (!content) return null

	return (
		<div className={className}>
			{content.split('\n\n').map((paragraph, i) => (
				<p key={i}>
					{paragraph.split('\n').map((line, j) => (
						<React.Fragment key={j}>
							{generateFragments(line).map((n, k) => (
								<React.Fragment key={k}>{n}</React.Fragment>
							))}
							{j < paragraph.split('\n').length - 1 && <br />}
						</React.Fragment>
					))}
				</p>
			))}
		</div>
	)
}

// vim: ts=4
