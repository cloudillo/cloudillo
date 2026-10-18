// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Person Message Handlers for Shell
 *
 * person:open.push — an app's person card asks the shell to open a profile or a DM.
 */

import type { PersonOpenPush } from '@cloudillo/core'
import { isIdTag } from '@cloudillo/types'

import { appTrust } from '../../app-trust.js'
import type { ShellMessageBus } from '../shell-bus.js'

/**
 * Opens a person's profile or a DM with them.
 * Registered by `PersonActionsProvider`, which lives inside the router.
 */
export type PersonOpenCallback = (idTag: string, target: 'profile' | 'messages') => void

let personOpenCallback: PersonOpenCallback | null = null

export function setPersonOpenCallback(cb: PersonOpenCallback | null): void {
	personOpenCallback = cb
}

export function initPersonHandlers(bus: ShellMessageBus): void {
	bus.on('person:open.push', (msg: PersonOpenPush, source) => {
		const appWindow = source as Window
		const connection = bus.getAppTracker().validateSource(source, true)
		// Not for embeds: an embedded document may not navigate the shell.
		if (!connection || connection.embed) return
		// Untrusted installed apps may not steer shell navigation
		if (appTrust(connection.appName) !== 'trusted') return
		// Only right after a user gesture in this app: an app may not navigate the shell on its own
		if (!navigator.userActivation?.isActive) return
		const active = document.activeElement
		if (!(active instanceof HTMLIFrameElement) || active.contentWindow !== appWindow) return
		const { idTag, target } = msg.payload
		if (!isIdTag(idTag) || (target !== 'profile' && target !== 'messages')) return
		personOpenCallback?.(idTag, target)
	})
}

// vim: ts=4
