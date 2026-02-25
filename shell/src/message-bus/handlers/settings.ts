// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Settings Message Handlers for Shell
 *
 * Proxies settings requests from sandboxed apps to the server API.
 * Enforces scope filtering: apps can only access settings under
 * their own `app.<appName>.*` prefix.
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { SettingsGetReq, SettingsSetReq, SettingsListReq } from '@cloudillo/core'

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

		const scopedKey = scopeKey(appName, msg.payload.key)
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
