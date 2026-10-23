// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Settings Message Handlers for Shell
 *
 * Proxies settings requests from sandboxed apps to the server API.
 * Enforces scope filtering: apps can only access settings under
 * their own `app.<appName>.*` prefix.
 */

import type { SettingsGetReq, SettingsListReq, SettingsSetReq } from '@cloudillo/core'

// The leaf module, not manifest-registry.ts (icon registry + React)
import { bundledManifests } from '../../bundled-manifests.js'
import type { ShellMessageBus } from '../shell-bus.js'

/**
 * Keys the backend registers `readable_by_all`. The shell's token is unscoped, so nothing
 * admin-only may ever go here, whatever a manifest's `readSettings` asks for.
 */
const PUBLIC_SETTING_KEYS: readonly string[] = ['map.tile_sources']

/**
 * A key outside the app's scope that its manifest's `readSettings` grants read access to.
 * Bundled manifests only: they ship with the shell, so an installed app cannot grant itself
 * a read of server settings the shell's unscoped token can see.
 */
export function readGrant(appName: string, key: string): string | undefined {
	if (!PUBLIC_SETTING_KEYS.includes(key)) return undefined
	const m = bundledManifests.find((b) => b.id === appName && b.kind === 'bundled')
	return m?.readSettings?.includes(key) ? key : undefined
}

/**
 * Validate and scope a key for the given app.
 * Returns the full server key (with `app.<appName>.` prefix) or undefined if invalid.
 */
function scopeKey(appName: string, key: string): string | undefined {
	const prefix = `app.${appName}.`
	// If key already has the prefix, validate it
	if (key.startsWith('app.')) {
		return key.startsWith(prefix) ? key : undefined
	}
	// Otherwise, prepend the prefix
	return `${prefix}${key}`
}

/**
 * Initialize settings message handlers on the shell bus
 */
export function initSettingsHandlers(bus: ShellMessageBus): void {
	// Handle settings:get.req
	bus.on('settings:get.req', async (msg: SettingsGetReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Settings] Request with no source window')
			return
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Settings] Request from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'settings:get.res',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		const api = bus.getApi()
		if (!api) {
			bus.sendResponse(
				appWindow,
				'settings:get.res',
				msg.id,
				false,
				undefined,
				'Not authenticated'
			)
			return
		}

		const appName = connection.appName
		if (!appName) {
			bus.sendResponse(
				appWindow,
				'settings:get.res',
				msg.id,
				false,
				undefined,
				'App name not set'
			)
			return
		}

		const scopedKey = readGrant(appName, msg.payload.key) ?? scopeKey(appName, msg.payload.key)
		if (!scopedKey) {
			bus.sendResponse(
				appWindow,
				'settings:get.res',
				msg.id,
				false,
				undefined,
				'Access denied: key outside app scope'
			)
			return
		}

		try {
			const result = await api.settings.get(scopedKey)
			bus.sendResponse(appWindow, 'settings:get.res', msg.id, true, result?.value)
		} catch (err) {
			// 404 means setting not found - return undefined (success with no data)
			if ((err as { httpStatus?: number }).httpStatus === 404) {
				bus.sendResponse(appWindow, 'settings:get.res', msg.id, true, undefined)
				return
			}
			console.error('[Settings] Get failed:', err)
			bus.sendResponse(
				appWindow,
				'settings:get.res',
				msg.id,
				false,
				undefined,
				(err as Error).message || 'Settings get failed'
			)
		}
	})

	// Handle settings:set.req
	bus.on('settings:set.req', async (msg: SettingsSetReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Settings] Request with no source window')
			return
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Settings] Request from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'settings:set.res',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		const api = bus.getApi()
		if (!api) {
			bus.sendResponse(
				appWindow,
				'settings:set.res',
				msg.id,
				false,
				undefined,
				'Not authenticated'
			)
			return
		}

		const appName = connection.appName
		if (!appName) {
			bus.sendResponse(
				appWindow,
				'settings:set.res',
				msg.id,
				false,
				undefined,
				'App name not set'
			)
			return
		}

		const scopedKey = scopeKey(appName, msg.payload.key)
		if (!scopedKey) {
			bus.sendResponse(
				appWindow,
				'settings:set.res',
				msg.id,
				false,
				undefined,
				'Access denied: key outside app scope'
			)
			return
		}

		try {
			await api.settings.update(scopedKey, { value: msg.payload.value })
			bus.sendResponse(appWindow, 'settings:set.res', msg.id, true)
		} catch (err) {
			console.error('[Settings] Set failed:', err)
			bus.sendResponse(
				appWindow,
				'settings:set.res',
				msg.id,
				false,
				undefined,
				(err as Error).message || 'Settings set failed'
			)
		}
	})

	// Handle settings:list.req
	bus.on('settings:list.req', async (msg: SettingsListReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Settings] Request with no source window')
			return
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Settings] Request from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'settings:list.res',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		const api = bus.getApi()
		if (!api) {
			bus.sendResponse(
				appWindow,
				'settings:list.res',
				msg.id,
				false,
				undefined,
				'Not authenticated'
			)
			return
		}

		const appName = connection.appName
		if (!appName) {
			bus.sendResponse(
				appWindow,
				'settings:list.res',
				msg.id,
				false,
				undefined,
				'App name not set'
			)
			return
		}

		// Always scope list to app.<appName> prefix (no trailing dot — server does starts_with)
		const scopedPrefix = `app.${appName}${msg.payload.prefix ? `.${msg.payload.prefix}` : ''}`

		try {
			const results = await api.settings.list({ prefix: scopedPrefix })
			const mapped = results.map((s) => ({ key: s.key, value: s.value }))
			bus.sendResponse(appWindow, 'settings:list.res', msg.id, true, mapped)
		} catch (err) {
			console.error('[Settings] List failed:', err)
			bus.sendResponse(
				appWindow,
				'settings:list.res',
				msg.id,
				false,
				undefined,
				(err as Error).message || 'Settings list failed'
			)
		}
	})
}

// vim: ts=4
