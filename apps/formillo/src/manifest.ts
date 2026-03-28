// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
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

import type { AppManifest } from '@cloudillo/core'
import pkg from '../package.json'

export const manifest: AppManifest = {
	id: 'formillo',
	name: 'Formillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/formillo/index.html',
	icon: 'clipboard-list',
	description: 'Surveys and forms',
	contentTypes: [
		{ mimeType: 'cloudillo/formillo', actions: ['view', 'edit', 'create'], priority: 'primary' }
	],
	capabilities: ['crdt'],
	translations: {
		hu: { description: 'Kérdőívek és űrlapok' }
	}
}

// vim: ts=4
