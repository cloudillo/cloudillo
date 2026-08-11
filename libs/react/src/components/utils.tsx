// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Deliberately router-free: every component imports this module, so anything
// pulled in here lands in every consumer's bundle. `generateFragments` and
// `FormattedText`, which do need `react-router-dom`, live in
// `./formatted-text.tsx` for exactly that reason.

import * as React from 'react'

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

// vim: ts=4
