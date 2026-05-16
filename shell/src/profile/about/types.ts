// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as T from '@symbion/runtype'
import type { TFunction } from 'i18next'
import type {
	SectionType,
	TabConfig,
	TabEntry,
	ContactContent,
	LinksContent,
	LocationContent,
	WorkContent,
	EducationContent,
	SkillsContent
} from '@cloudillo/types'
import { tTabConfig } from '@cloudillo/types'

// Re-export for convenience
export type {
	SectionType,
	TabConfig,
	TabEntry,
	ContactContent,
	LinksContent,
	LocationContent,
	WorkContent,
	EducationContent,
	SkillsContent
}

// ============================================================================
// Layout types
// ============================================================================

// A layout item is either a section ID or a 2-column container
export interface ColsLayout {
	left: string[]
	right: string[]
}

export type LayoutItem = string | ColsLayout

// ============================================================================
// Runtime section with content (assembled from flat x keys)
// ============================================================================

export interface SectionWithContent {
	id: string
	type: SectionType
	content: string
	title?: string
	visibility: string // 'P' | 'F' | 'C' | role name
}

// ============================================================================
// Section type registry
// ============================================================================

export interface SectionTypeDef {
	type: SectionType
	defaultTitle: string // already-translated section title
	description: string // already-translated section picker description
	personal: boolean
	community: boolean
	multiple: boolean // can add more than one?
}

// Structural metadata (no translatable strings) — safe at module scope.
interface SectionTypeMeta {
	type: SectionType
	personal: boolean
	community: boolean
	multiple: boolean
}

const SECTION_TYPES_META: SectionTypeMeta[] = [
	{ type: 'about', personal: true, community: true, multiple: false },
	{ type: 'contact', personal: true, community: true, multiple: false },
	{ type: 'location', personal: true, community: true, multiple: false },
	{ type: 'links', personal: true, community: true, multiple: false },
	{ type: 'work', personal: true, community: false, multiple: false },
	{ type: 'education', personal: true, community: false, multiple: false },
	{ type: 'skills', personal: true, community: false, multiple: false },
	{ type: 'rules', personal: false, community: true, multiple: false },
	{ type: 'custom', personal: true, community: true, multiple: true }
]

export const getSectionTypes = (t: TFunction): SectionTypeDef[] => [
	{
		type: 'about',
		defaultTitle: t('About'),
		description: t('Rich text description'),
		personal: true,
		community: true,
		multiple: false
	},
	{
		type: 'contact',
		defaultTitle: t('Contact'),
		description: t('Email, phone, website'),
		personal: true,
		community: true,
		multiple: false
	},
	{
		type: 'location',
		defaultTitle: t('Location'),
		description: t('City, country, address'),
		personal: true,
		community: true,
		multiple: false
	},
	{
		type: 'links',
		defaultTitle: t('Links'),
		description: t('External links with icons'),
		personal: true,
		community: true,
		multiple: false
	},
	{
		type: 'work',
		defaultTitle: t('Experience'),
		description: t('Work experience'),
		personal: true,
		community: false,
		multiple: false
	},
	{
		type: 'education',
		defaultTitle: t('Education'),
		description: t('Schools and degrees'),
		personal: true,
		community: false,
		multiple: false
	},
	{
		type: 'skills',
		defaultTitle: t('Skills & Interests'),
		description: t('Tags and keywords'),
		personal: true,
		community: false,
		multiple: false
	},
	{
		type: 'rules',
		defaultTitle: t('Community Rules'),
		description: t('Guidelines and rules'),
		personal: false,
		community: true,
		multiple: false
	},
	{
		type: 'custom',
		defaultTitle: t('Custom Section'),
		description: t('Free-form rich text block'),
		personal: true,
		community: true,
		multiple: true
	}
]

export function getSectionTypeDef(t: TFunction, type: SectionType): SectionTypeDef | undefined {
	return getSectionTypes(t).find((s) => s.type === type)
}

export function getDefaultTitle(t: TFunction, type: SectionType): string {
	return getSectionTypeDef(t, type)?.defaultTitle ?? t('Section')
}

export function getSectionTitle(t: TFunction, section: SectionWithContent): string {
	return section.title || getDefaultTitle(t, section.type)
}

// ============================================================================
// Content helpers (parse/stringify structured section content)
// ============================================================================

export function parseContent<T>(content: string, fallback: T): T {
	try {
		return JSON.parse(content) as T
	} catch {
		return fallback
	}
}

export function stringifyContent<T>(data: T): string {
	return JSON.stringify(data)
}

// Normalize a user-entered URL by adding `https://` when no scheme is present,
// so a value like "cloudillo.org" produces a working absolute href instead of
// a relative link. Whitelisted schemes pass through; anything else (including
// `javascript:` and `data:`) is rejected to '' so the rendered <a href> is inert.
const ALLOWED_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'sms', 'matrix', 'xmpp'])

export function ensureUrlProtocol(url: string): string {
	const trimmed = url.trim()
	if (!trimmed) return ''
	const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
	if (schemeMatch) {
		return ALLOWED_URL_SCHEMES.has(schemeMatch[1].toLowerCase()) ? trimmed : ''
	}
	if (trimmed.startsWith('//')) return `https:${trimmed}`
	return `https://${trimmed}`
}

// ============================================================================
// Default empty content for each section type
// ============================================================================

export function getDefaultContent(type: SectionType): string {
	switch (type) {
		case 'about':
		case 'rules':
		case 'custom':
			return ''
		case 'contact':
			return JSON.stringify({ email: '', phone: '', website: '' } satisfies ContactContent)
		case 'location':
			return JSON.stringify({ city: '', country: '', address: '' } satisfies LocationContent)
		case 'links':
			return JSON.stringify({ links: [] } satisfies LinksContent)
		case 'work':
			return JSON.stringify({ entries: [] } satisfies WorkContent)
		case 'education':
			return JSON.stringify({ entries: [] } satisfies EducationContent)
		case 'skills':
			return JSON.stringify({ tags: [] } satisfies SkillsContent)
	}
}

// ============================================================================
// Layout string format:
//   "about,contact,cols:skills+education|location+links,custom-AB12"
//
// - Simple sections: just their ID
// - 2-column: cols:<left1>+<left2>|<right1>+<right2>
// ============================================================================

export function parseLayout(layoutStr: string): LayoutItem[] {
	if (!layoutStr || layoutStr.startsWith('[')) return []
	return layoutStr.split(',').map((token) => {
		if (token.startsWith('cols:')) {
			const inner = token.slice(5)
			const [leftStr, rightStr] = inner.split('|')
			return {
				left: leftStr ? leftStr.split('+') : [],
				right: rightStr ? rightStr.split('+') : []
			}
		}
		return token
	})
}

export function serializeLayout(items: LayoutItem[]): string {
	return items
		.map((item) => {
			if (typeof item === 'string') return item
			const left = item.left.join('+')
			const right = item.right.join('+')
			return `cols:${left}|${right}`
		})
		.join(',')
}

export function flattenLayoutItems(items: LayoutItem[]): string[] {
	const ids: string[] = []
	for (const item of items) {
		if (typeof item === 'string') {
			ids.push(item)
		} else {
			ids.push(...item.left, ...item.right)
		}
	}
	return ids
}

export function isColsLayout(item: LayoutItem): item is ColsLayout {
	return typeof item !== 'string'
}

// ============================================================================
// Parse: read flat x keys into SectionWithContent[] + layout
// ============================================================================

type XMap = Record<string, string>

export function parseSections(x?: XMap): {
	layout: LayoutItem[]
	sections: SectionWithContent[]
} {
	if (!x) return { layout: [], sections: [] }

	const layout = parseLayout(x.sections ?? '')

	// Extract section data from flat keys
	const ids = flattenLayoutItems(layout)
	const sections: SectionWithContent[] = []
	for (const id of ids) {
		// Infer type from ID: singletons use type as ID, custom uses custom- prefix
		const type: SectionType | undefined = SINGLETON_TYPES.has(id)
			? (id as SectionType)
			: id.startsWith('custom-')
				? 'custom'
				: undefined
		if (!type) continue
		sections.push({
			id,
			type,
			content: x[id] ?? '',
			title: x[`${id}.title`],
			visibility: x[`${id}.vis`] ?? 'P'
		})
	}

	return { layout, sections }
}

// ============================================================================
// Save: convert sections + layout back to flat x keys for PATCH
// ============================================================================

export function buildSavePatch(
	layout: LayoutItem[],
	sections: SectionWithContent[],
	deletedIds: string[]
): Record<string, string | null> {
	const patch: Record<string, string | null> = {}

	// Layout as comma-separated string
	patch.sections = serializeLayout(layout)

	// Section data as flat keys
	for (const section of sections) {
		patch[section.id] = section.content
		patch[`${section.id}.title`] = section.title || null
		patch[`${section.id}.vis`] =
			section.visibility && section.visibility !== 'P' ? section.visibility : null
	}

	// Clean up deleted sections
	for (const id of deletedIds) {
		patch[id] = null
		patch[`${id}.title`] = null
		patch[`${id}.vis`] = null
	}

	return patch
}

// ============================================================================
// Tab config helpers
// ============================================================================

export function parseTabConfig(x?: XMap): TabConfig | undefined {
	if (!x?.tabConfig) return undefined
	try {
		const result = T.decode(tTabConfig, JSON.parse(x.tabConfig))
		return T.isOk(result) ? result.ok : undefined
	} catch {
		return undefined
	}
}

export const DEFAULT_TABS: TabEntry[] = [
	{ id: 'feed', visible: true, order: 0 },
	{ id: 'about', visible: true, order: 1 },
	{ id: 'connections', visible: true, order: 2 },
	{ id: 'gallery', visible: false, order: 3 },
	{ id: 'files', visible: false, order: 4 }
]

export const LOCKED_TABS = ['feed', 'about'] // Cannot be hidden

export function getEffectiveTabs(tabConfig?: TabConfig): TabEntry[] {
	if (!tabConfig?.tabs?.length) return DEFAULT_TABS
	return [...tabConfig.tabs].sort((a, b) => a.order - b.order)
}

// ============================================================================
// ID generation
// ============================================================================

const SINGLETON_TYPES: Set<string> = new Set(
	SECTION_TYPES_META.filter((s) => !s.multiple).map((s) => s.type)
)

function generateCustomSectionId(existingIds: Set<string>): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
	for (let attempt = 0; attempt < 10; attempt++) {
		let suffix = ''
		for (let i = 0; i < 4; i++) {
			suffix += chars[Math.floor(Math.random() * chars.length)]
		}
		const id = `custom-${suffix}`
		if (!existingIds.has(id)) return id
	}
	// Extremely unlikely fallback: extend to 6 chars
	let suffix = ''
	for (let i = 0; i < 6; i++) {
		suffix += chars[Math.floor(Math.random() * chars.length)]
	}
	return `custom-${suffix}`
}

export function getSectionId(type: SectionType, existingIds: string[]): string {
	if (type !== 'custom') return type
	return generateCustomSectionId(new Set(existingIds))
}

// vim: ts=4
