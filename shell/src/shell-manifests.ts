// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell's own internal apps, as manifests.
 *
 * A leaf module on purpose: `manifest-registry.ts` re-exports these but also pulls in
 * the icon registry and the UI types — too heavy to bundle for Node. The build
 * serializes *this* module into `dist/shell-apps.json`, which the backend reads at
 * startup for the content types these apps declare
 * (`scripts/esbuild-common.js::emitCloudilloManifest`).
 *
 * Internal apps have no `dist/apps/<id>` directory of their own, hence one array
 * rather than one file each.
 *
 * Keep this importing manifests and nothing else.
 */

import type { AppManifest } from '@cloudillo/types'

import { manifest as calendarManifest } from './apps/calendar/manifest.js'
import { manifest as contactsManifest } from './apps/contacts/manifest.js'
import { manifest as feedManifest } from './apps/feed/manifest.js'
import { manifest as filesManifest } from './apps/files/manifest.js'
import { manifest as galleryManifest } from './apps/gallery/manifest.js'
import { manifest as messagesManifest } from './apps/messages/manifest.js'
import { manifest as viewerManifest } from './apps/viewer/manifest.js'

export const shellManifests: AppManifest[] = [
	filesManifest,
	feedManifest,
	galleryManifest,
	messagesManifest,
	contactsManifest,
	calendarManifest,
	viewerManifest
]

// vim: ts=4
