// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Utility exports
 */

export * from './constants'
export * from './measure-text'
export * from './style-props'
export * from './text-styles'
export * from './transforms'

/**
 * Merge CSS class names, filtering out falsy values
 */
export function mergeClasses(...classes: (string | false | undefined | null)[]): string {
	return classes.filter(Boolean).join(' ')
}

// vim: ts=4
