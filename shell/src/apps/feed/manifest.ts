// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/types'
import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'feed',
	name: 'Feed',
	version: pkg.version,
	kind: 'internal',
	icon: 'list',
	defaultOrder: 20,
	translations: {
		hu: { name: 'Hírfolyam' }
	}
}

// vim: ts=4
