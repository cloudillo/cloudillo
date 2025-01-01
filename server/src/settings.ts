// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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

export interface Settings {
	lang: string
	theme: string
	'theme.dark': boolean | 'auto'
	// Upload
	'upload.max': number
	'image.orig': boolean
}

const settings: Settings = {
	lang: 'en',
	theme: 'auto',
	'theme.dark': 'auto',
	'upload.max': 50,
	'image.orig': true,
}

export async function get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
	return settings[key]
}

// vim: ts=4
