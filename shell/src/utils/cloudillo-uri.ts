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

export type CloudilloUri = { type: 'id'; idTag: string } | { type: 'unknown'; raw: string }

export function parseCloudilloUri(uri: string): CloudilloUri | null {
	if (!uri.startsWith('cloudillo:')) return null

	const rest = uri.slice('cloudillo:'.length)
	const colonIdx = rest.indexOf(':')
	if (colonIdx === -1) return { type: 'unknown', raw: uri }

	const uriType = rest.slice(0, colonIdx)
	const payload = rest.slice(colonIdx + 1)

	if (uriType === 'id' && payload) {
		return { type: 'id', idTag: payload }
	}

	return { type: 'unknown', raw: uri }
}

export function buildCloudilloUri(type: string, payload: string): string {
	return `cloudillo:${type}:${payload}`
}

// vim: ts=4
