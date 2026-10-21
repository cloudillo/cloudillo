// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Runtime shapes. The engine model of `@cloudillo/typeset` (`Publication`, `Story`,
 * `Paragraph`, `Master`, `Section`, `Frame`, `StyleDef`) *is* pagillo's runtime model; only
 * publication meta has an app-level runtime type. Type-only imports: worker-safe.
 */

import type { Fx } from '@cloudillo/typeset'
import type { StyleMap } from './stored-types'

export type {
	Frame,
	Master,
	Paragraph,
	Publication,
	Section,
	Story,
	StyleDef
} from '@cloudillo/typeset'

export interface PageSize {
	w: Fx
	h: Fx
}

/** `m` with defaults applied (`readMeta`). */
export interface PublicationMeta {
	title?: string
	page: PageSize
	facing: boolean
	engine?: string
	fonts?: Record<string, string>
	pdf?: Record<string, unknown>
	lang: string
	styleMap: StyleMap
	exportedAt?: string
	spellIgnore: string[]
}

// vim: ts=4
