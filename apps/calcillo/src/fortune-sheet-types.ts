// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Extended FortuneSheet types
 *
 * FortuneSheet's Cell type doesn't include all optional format attributes
 * that exist at runtime. This module centralizes the necessary type
 * extensions so call sites don't need individual `as any` casts.
 */

import type { Cell } from '@fortune-sheet/core'
import type { WorkbookInstance } from '@fortune-sheet/react'
import type { SheetId } from './yjs-types'

/**
 * Cell format attributes that exist on ExtendedCell — safe to index with.
 */
export type CellStyleAttr =
	| 'bl'
	| 'it'
	| 'ff'
	| 'fs'
	| 'fc'
	| 'bg'
	| 'ht'
	| 'vt'
	| 'un'
	| 'cl'
	| 'st'
	| 'tb'

/**
 * All format attributes accepted by setCellFormatExt(), including non-cell ones like 'bd'.
 */
export type CellFormatAttr = CellStyleAttr | 'bd'

/**
 * Extended Cell type that includes optional format attributes missing from FortuneSheet's type.
 * Uses Cell & { extra fields } so it remains assignable to Cell.
 */
export type ExtendedCell = Cell & {
	bl?: number
	it?: number
	ff?: number | string
	fs?: number
	fc?: string
	bg?: string
	ht?: number
	vt?: number
	un?: number
	cl?: number
	st?: number
	tb?: number | string
}

/**
 * FortuneSheet freeze type parameter — includes valid values the API accepts
 * but omits from its type definitions.
 */
export type FreezeType = 'row' | 'column' | 'both' | 'cancel'

/**
 * Type-safe wrapper around wb.freeze() that accepts all valid freeze types.
 */
export function freezeSheet(
	wb: WorkbookInstance,
	type: FreezeType,
	range: { row: number; column: number },
	options?: { id: SheetId | string }
): void {
	// biome-ignore lint/suspicious/noExplicitAny: FortuneSheet freeze API type is incomplete
	wb.freeze(type as any, range, options)
}

/**
 * Type-safe wrapper around wb.setCellFormat() that accepts extended format attributes.
 */
export function setCellFormatExt(
	wb: WorkbookInstance,
	row: number,
	col: number,
	attr: CellFormatAttr,
	value: unknown,
	options?: { id: SheetId | string }
): void {
	// biome-ignore lint/suspicious/noExplicitAny: FortuneSheet setCellFormat attr type is incomplete
	wb.setCellFormat(row, col, attr as any, value, options)
}

// vim: ts=4
