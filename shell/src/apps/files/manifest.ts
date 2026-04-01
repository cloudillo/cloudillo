// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest } from '@cloudillo/types'
import pkg from '../../../package.json'

export const manifest: AppManifest = {
	id: 'files',
	name: 'Files',
	version: pkg.version,
	kind: 'internal',
	icon: 'file',
	defaultOrder: 10,
	capabilities: ['storage'],
	translations: {
		hu: { name: 'Fájlok' }
	}
}

// vim: ts=4
