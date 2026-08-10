// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The bundled *illo apps, as manifests.
 *
 * A leaf module for the same reason `shell-manifests.ts` is one: `manifest-registry.ts`
 * re-exports these but also pulls in the icon registry and the UI types — too heavy
 * for a Node-side consumer that only wants the declared data. Keeping the imports here
 * lets `__tests__/manifests.test.ts` validate every shipped manifest under the node
 * environment without loading React.
 *
 * Keep this importing manifests and nothing else.
 */

import type { AppManifest } from '@cloudillo/types'

import { manifest as calcilloManifest } from '../../apps/calcillo/src/manifest.js'
import { manifest as formilloManifest } from '../../apps/formillo/src/manifest.js'
import { manifest as idealloManifest } from '../../apps/ideallo/src/manifest.js'
import { manifest as mapilloManifest } from '../../apps/mapillo/src/manifest.js'
import { manifest as notilloManifest } from '../../apps/notillo/src/manifest.js'
import { manifest as prezilloManifest } from '../../apps/prezillo/src/manifest.js'
import { manifest as quilloManifest } from '../../apps/quillo/src/manifest.js'
import { manifest as scanilloManifest } from '../../apps/scanillo/src/manifest.js'
import { manifest as taskilloManifest } from '../../apps/taskillo/src/manifest.js'

export const bundledManifests: AppManifest[] = [
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

// vim: ts=4
