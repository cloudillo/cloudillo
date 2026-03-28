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
	id: 'scanillo',
	name: 'Scanillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/scanillo/index.html',
	icon: 'scan',
	description: 'Document scanner',
	contentTypes: [
		{ mimeType: 'cloudillo/scanillo', actions: ['view', 'edit', 'create'], priority: 'primary' }
	],
	launchModes: [
		{
			id: 'scan',
			label: 'Scan',
			description: 'Capture document with camera',
			translations: {
				hu: { label: 'Szkennelés', description: 'Dokumentum rögzítés kamerával' }
			}
		}
	],
	capabilities: ['camera', 'media'],
	translations: {
		hu: { description: 'Dokumentum szkenner' }
	}
}

// vim: ts=4
