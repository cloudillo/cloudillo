// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/types'
import type { AppConfigState, MenuItem } from './utils.js'
import { getIcon } from './icon-registry.js'

// Internal app manifests
import { manifest as filesManifest } from './apps/files/manifest.js'
import { manifest as feedManifest } from './apps/feed/manifest.js'
import { manifest as galleryManifest } from './apps/gallery/manifest.js'
import { manifest as messagesManifest } from './apps/messages/manifest.js'
import { manifest as contactsManifest } from './apps/contacts/manifest.js'
import { manifest as viewerManifest } from './apps/viewer/manifest.js'

// Bundled app manifests
import { manifest as quilloManifest } from '../../apps/quillo/src/manifest.js'
import { manifest as calcilloManifest } from '../../apps/calcillo/src/manifest.js'
import { manifest as idealloManifest } from '../../apps/ideallo/src/manifest.js'
import { manifest as prezilloManifest } from '../../apps/prezillo/src/manifest.js'
import { manifest as formilloManifest } from '../../apps/formillo/src/manifest.js'
import { manifest as taskilloManifest } from '../../apps/taskillo/src/manifest.js'
import { manifest as notilloManifest } from '../../apps/notillo/src/manifest.js'
import { manifest as mapilloManifest } from '../../apps/mapillo/src/manifest.js'
import { manifest as scanilloManifest } from '../../apps/scanillo/src/manifest.js'

// All registered manifests
export const allManifests: AppManifest[] = [
	// Internal
	filesManifest,
	feedManifest,
	galleryManifest,
	messagesManifest,
	contactsManifest,
	viewerManifest,
	// Bundled
	quilloManifest,
	calcilloManifest,
	idealloManifest,
	prezilloManifest,
	formilloManifest,
	taskilloManifest,
	notilloManifest,
	mapilloManifest,
	scanilloManifest
]

// Shell navigation items (not apps — communities, users, settings, etc.)
const SHELL_MENU: MenuItem[] = [
	{
		id: 'communities',
		icon: getIcon('users'),
		label: 'Communities',
		trans: { hu: 'Közösségek' },
		path: '/communities'
	},
	{
		id: 'users',
		icon: getIcon('user'),
		label: 'People',
		trans: { hu: 'Emberek' },
		path: '/users'
	},
	{
		id: 'settings',
		icon: getIcon('settings'),
		label: 'Settings',
		trans: { hu: 'Beállítások' },
		path: '/settings'
	},
	{
		id: 'idp',
		icon: getIcon('fingerprint'),
		label: 'IDP',
		trans: { hu: 'IDP' },
		path: '/idp'
	},
	{
		id: 'site-admin',
		icon: getIcon('server-cog'),
		label: 'Server',
		trans: { hu: 'Szerver' },
		path: '/site-admin',
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
		path: `/app/${m.id}`,
		public: true
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

// vim: ts=4
