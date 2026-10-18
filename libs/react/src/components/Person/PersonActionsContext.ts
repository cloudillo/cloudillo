// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getAppBus } from '@cloudillo/core'
import * as React from 'react'

import type { ProfileNode } from '../../profile-cache.js'

/**
 * What a person card can do, and which node it reads profiles from. An action button
 * renders only when its handler is set.
 */
export interface PersonActions {
	/** Node + token profiles are fetched from; unset falls back to the app bus's node. */
	node?: ProfileNode
	openProfile?(idTag: string): void
	message?(idTag: string): void
	more?(idTag: string, anchor: HTMLElement): void
}

/** Inside an app iframe once the bus has initialised (it knows who we are). */
function appBusReady(): boolean {
	if (typeof window === 'undefined' || window.parent === window) return false
	const bus = getAppBus()
	// An embedded document may not navigate the shell, so it gets no action buttons
	return !bus.embedded && !!(bus.idTag || bus.ownerTag)
}

/**
 * The default for apps, which have no provider: the actions go to the shell over the bus.
 * Getters, because the bus initialises after this module loads; outside an initialised
 * app (the shell without its provider, tests) they read as unset, so no buttons show.
 */
const appActions: PersonActions = {
	get openProfile() {
		return appBusReady()
			? (idTag: string) => getAppBus().openPerson(idTag, 'profile')
			: undefined
	},
	get message() {
		return appBusReady()
			? (idTag: string) => getAppBus().openPerson(idTag, 'messages')
			: undefined
	}
}

/** The shell provides navigation and `more`; apps get the bus-backed default. */
export const PersonActionsContext = React.createContext<PersonActions>(appActions)

// vim: ts=4
