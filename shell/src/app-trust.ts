// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The single source of an app's trust level. A leaf module (manifests only, no React, no icon
 * registry) so `message-bus/handlers/embed.ts` and the node-side tests can import it;
 * `manifest-registry.ts` re-exports it.
 */

import { bundledManifests } from './bundled-manifests.js'
import { shellManifests } from './shell-manifests.js'
import type { TrustLevel } from './utils.js'

const manifests = [...shellManifests, ...bundledManifests]

/**
 * Today: bundled → 'trusted', everything else 'untrusted'. Installed apps will resolve from the
 * backend `installed_apps.trusted` flag once the shell lists them.
 */
export function appTrust(appId: string | undefined): TrustLevel {
	return manifests.some((m) => m.id === appId && m.kind === 'bundled') ? 'trusted' : 'untrusted'
}

/** The manifest's `requiresTrusted`: such an app never boots below 'trusted' */
export function appRequiresTrusted(appId: string | undefined): boolean {
	return manifests.some((m) => m.id === appId && !!m.requiresTrusted)
}

// vim: ts=4
