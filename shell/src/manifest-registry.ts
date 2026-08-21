// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { siteIslandRegistry } from '@cloudillo/core'
import {
	type AppManifest,
	type PartAddressing,
	type SiteIslandSpec,
	tSiteIslandSpec
} from '@cloudillo/types'
import * as T from '@symbion/runtype'

// Bundled app manifests, in their own leaf module for the same reason as the internal
// ones below.
import { bundledManifests } from './bundled-manifests.js'
import { getIcon } from './icon-registry.js'
// Internal app manifests, in their own leaf module so the build can serialize them
// into `dist/shell-apps.json` without dragging in the icon registry and the UI types
// this file imports.
import { shellManifests } from './shell-manifests.js'
import type { AppConfigState, MenuItem } from './utils.js'

// All registered manifests
export const allManifests: AppManifest[] = [...shellManifests, ...bundledManifests]

// Shell navigation items (not apps — communities, users, settings, etc.).
//
// `path` is a context-RELATIVE template: `scopePath(ctx.base, path)` turns it into a real
// route. An absolute one passes through unscoped — see `site-admin` below.
const SHELL_MENU: MenuItem[] = [
	{
		id: 'communities',
		icon: getIcon('users'),
		label: 'Communities',
		trans: { hu: 'Közösségek' },
		path: 'communities'
	},
	{
		id: 'users',
		icon: getIcon('user'),
		label: 'People',
		trans: { hu: 'Emberek' },
		path: 'users'
	},
	{
		id: 'settings',
		icon: getIcon('settings'),
		label: 'Settings',
		trans: { hu: 'Beállítások' },
		path: 'settings'
	},
	{
		id: 'idp',
		icon: getIcon('fingerprint'),
		label: 'IDP',
		trans: { hu: 'IDP' },
		path: 'idp'
	},
	{
		id: 'site-admin',
		icon: getIcon('server-cog'),
		label: 'Server',
		trans: { hu: 'Szerver' },
		// Absolute on purpose: it administers the node, so it is pinned to home whatever
		// context is being browsed (`site-admin/index.tsx` re-pins on arrival).
		path: '/~/site-admin',
		perm: 'SADM'
	}
]

// Shell menu item default order values
const SHELL_MENU_ORDER: Record<string, number> = {
	communities: 30,
	users: 70,
	settings: 80,
	idp: 90,
	'site-admin': 100
}

/**
 * contentType → `/app/<id>`. NOT a menu path: its consumers (`search-target.ts`,
 * `apps/shared.tsx`, `FilesApp`) keep only the last segment, so it stays absolute while the
 * menu templates are context-relative.
 */
function buildMimeMap(manifests: AppManifest[]): Record<string, string> {
	const mimeMap: Record<string, string> = {}
	for (const m of manifests) {
		for (const ct of m.contentTypes ?? []) {
			if (!mimeMap[ct.mimeType] || ct.priority === 'primary') {
				mimeMap[ct.mimeType] = `/app/${m.id}`
			}
		}
	}
	return mimeMap
}

const AUTH_ONLY_APPS = new Set(['calendar', 'mapillo', 'messages', 'contacts'])

function manifestToMenuItem(m: AppManifest): MenuItem {
	return {
		id: m.id,
		icon: getIcon(m.icon),
		label: m.name,
		trans: Object.fromEntries(
			Object.entries(m.translations ?? {})
				.filter(([, t]) => t.name)
				.map(([lang, t]) => [lang, t.name!])
		),
		path: `app/${m.id}`,
		public: !AUTH_ONLY_APPS.has(m.id)
	}
}

export function buildAppConfig(manifests: AppManifest[]): AppConfigState {
	// Build app config entries for external apps
	const apps = manifests
		.filter((m) => m.kind !== 'internal')
		.map((m) => ({
			id: m.id,
			url: m.url!,
			trust: m.kind === 'bundled' ? (true as const) : undefined
		}))

	// Build MIME map
	const mime = buildMimeMap(manifests)

	// Build menu from app manifests that have defaultOrder + shell menu items
	const appMenuItems = manifests
		.filter((m) => m.defaultOrder != null)
		.map((m) => ({ item: manifestToMenuItem(m), order: m.defaultOrder! }))

	const shellMenuItems = SHELL_MENU.map((item) => ({
		item,
		order: SHELL_MENU_ORDER[item.id] ?? 100
	}))

	const menu = [...appMenuItems, ...shellMenuItems]
		.sort((a, b) => a.order - b.order)
		.map((entry) => entry.item)

	const defaultMenu = manifests
		.filter((m) => m.defaultOrder != null)
		.sort((a, b) => a.defaultOrder! - b.defaultOrder!)[0]?.id

	return { apps, mime, menu, defaultMenu }
}

export const appConfig = buildAppConfig(allManifests)

/**
 * Returns all configurable menu items (app manifests + shell items).
 * Used by the App Menu Configurator in settings.
 */
export function getAllMenuItems(): MenuItem[] {
	const appItems = allManifests.filter((m) => m.defaultOrder != null).map(manifestToMenuItem)
	return [...appItems, ...SHELL_MENU]
}

/**
 * Apply user's custom menu configuration on top of the base app config.
 * Items not found in the item pool (e.g. uninstalled apps) are silently dropped.
 */
export function applyMenuConfig(
	baseConfig: AppConfigState,
	menuSetting: { main: string[]; extra?: string[] }
): AppConfigState {
	const allItems = getAllMenuItems()
	const itemMap = new Map(allItems.map((item) => [item.id, item]))

	const resolveItems = (ids: string[] | undefined): MenuItem[] =>
		(ids ?? []).map((id) => itemMap.get(id)).filter((item): item is MenuItem => item != null)

	const menu = [...resolveItems(menuSetting.main), ...resolveItems(menuSetting.extra)]
	const defaultMenu = menuSetting.main[0] ?? baseConfig.defaultMenu

	return { ...baseConfig, menu, defaultMenu }
}

// Content type handler lookup for "Open With" functionality
export interface AppHandler {
	manifest: AppManifest
	actions: string[]
	priority: string | undefined
}

/**
 * Find all apps that can handle a given content type.
 * Returns handlers sorted by priority (primary first).
 */
export function getHandlersForContentType(contentType: string): AppHandler[] {
	const handlers: AppHandler[] = []
	for (const m of allManifests) {
		for (const ct of m.contentTypes ?? []) {
			if (ct.mimeType === contentType) {
				handlers.push({
					manifest: m,
					actions: ct.actions ?? [],
					priority: ct.priority
				})
			}
		}
	}
	// Primary handlers first
	handlers.sort((a, b) => {
		if (a.priority === 'primary' && b.priority !== 'primary') return -1
		if (b.priority === 'primary' && a.priority !== 'primary') return 1
		return 0
	})
	return handlers
}

// ============================================
// IMPORT HANDLER LOOKUP
// ============================================

export interface ImportHandler {
	manifest: AppManifest
	targetMimeType: string
	label: string
}

/**
 * Find all apps that can import/convert from a given source MIME type.
 * Used by the smart upload feature to offer conversion options.
 */
export function getImportHandlers(sourceMimeType: string): ImportHandler[] {
	const handlers: ImportHandler[] = []
	for (const m of allManifests) {
		for (const ct of m.contentTypes ?? []) {
			for (const imp of ct.importFrom ?? []) {
				if (imp.mimeType === sourceMimeType) {
					handlers.push({
						manifest: m,
						targetMimeType: ct.mimeType,
						label: imp.label
					})
				}
			}
		}
	}
	return handlers
}

// ============================================
// PART ADDRESSING LOOKUP
// ============================================

/**
 * Content types whose part addressing the platform itself defines.
 *
 * A published site container is produced by the shell's own publish handler
 * (`message-bus/handlers/site.ts`), not by any app's document format, so there is no
 * manifest for it to be declared in — and it must not be an app's to declare. An app
 * that could claim `application/vnd.cloudillo.site+zip` would decide where every site
 * search hit navigates, which is the site owner's business, not a plugin's.
 *
 * `sitePath` means the row's `partId` *is* a site-absolute path: the search index
 * writes it that way (mount joined with the page's container-relative path), so the
 * hit resolves with no manifest lookup.
 */
const BUILTIN_PART_ADDRESSING: Record<string, PartAddressing> = {
	'application/vnd.cloudillo.site+zip': { kind: 'sitePath' }
}

/**
 * How a hit's `partId` addresses its part, for a given content type.
 *
 * The sibling of `getSiteIslands()` below, and it takes the same stance: built-ins
 * win over any declaration. `undefined` means the type declares no part addressing,
 * i.e. the whole file is the target and a `partId` is not navigable on its own.
 */
export function getPartAddressing(contentType: string | undefined): PartAddressing | undefined {
	if (!contentType) return undefined
	const builtin = BUILTIN_PART_ADDRESSING[contentType]
	if (builtin) return builtin
	for (const m of allManifests) {
		for (const ct of m.contentTypes ?? []) {
			if (ct.mimeType === contentType && ct.parts) return ct.parts
		}
	}
	return undefined
}

// ============================================
// SITE ISLAND LOOKUP
// ============================================

/**
 * Every island declaration in effect, keyed by block type — the built-ins from
 * `@cloudillo/core` plus whatever the registered manifests declare.
 *
 * This is the shell's collection point for the island registry, the same role
 * `contentTypes[].search` plays for the search index rules. `site-4-shell-runtime`
 * calls it once and then resolves each `data-cl-block` it finds on a published page:
 * a spec whose `appId` is set is rendered by that app in an iframe, one whose block
 * type has a component in `@cloudillo/react`'s table is rendered by that component.
 *
 * `appId` is stamped in here rather than written into a manifest — the declaring
 * app is the one whose manifest it is, and letting a manifest name a *different* app
 * would let it hand its blocks to someone else's iframe.
 *
 * Built-ins win over any declaration: an app must not be able to flip `image` from
 * `enhance` to `replace` on the site owner's own page. `siteIslandRegistry` enforces
 * that; the loop below only gathers what it merges.
 *
 * Every declaration is decoded against `tSiteIslandSpec` before it is gathered.
 * `allManifests` is a build-time TypeScript array today, so the compiler already
 * constrains these — but a spec's `shape` reaches a class name on a published page,
 * an external manifest is the whole point of the declaration mechanism, and a
 * malformed one has to be diagnosable rather than half-registered. Decode first and
 * stamp `appId` after, so the decode cannot be what strips it.
 */
export function getSiteIslands(): Map<string, SiteIslandSpec> {
	const declared: SiteIslandSpec[] = []
	for (const m of allManifests) {
		for (const ct of m.contentTypes ?? []) {
			for (const island of ct.islands?.islands ?? []) {
				const spec = T.decode(tSiteIslandSpec, island, { unknownFields: 'drop' })
				if (!T.isOk(spec)) {
					console.warn(`[site] ${m.id}: malformed island declaration`, spec.err, island)
					continue
				}
				declared.push({ ...spec.ok, appId: m.id })
			}
		}
	}
	return siteIslandRegistry(declared)
}

// vim: ts=4
