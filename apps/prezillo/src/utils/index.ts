// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Utility exports
 */

export * from './constants'
export * from './coordinates'
export * from './text-styles'
export * from './measure-text'
export * from './transforms'
export * from './style-props'

/**
 * Merge CSS class names, filtering out falsy values
 */
export function mergeClasses(...classes: (string | false | undefined | null)[]): string {
	return classes.filter(Boolean).join(' ')
}

// vim: ts=4
