// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/types'
import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'gallery',
	name: 'Gallery',
	version: pkg.version,
	kind: 'internal',
	icon: 'image',
	defaultOrder: 50,
	translations: {
		hu: { name: 'Galéria' }
	}
}

// vim: ts=4
