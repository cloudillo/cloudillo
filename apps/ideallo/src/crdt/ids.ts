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

/**
 * Branded ID type for compile-time safety
 * Uses 72-bit entropy (12 base64url chars) - sufficient for collaborative editing
 *
 * Note: ObjectId is used for objects, and also as keys in txt/geo maps.
 * Normal objects use their own ID as the key. Linked copies use explicit tid/gid
 * pointing to another object's ID (sharing the same text/geometry).
 */

export type ObjectId = string & { readonly __brand: 'ObjectId' }

export const toObjectId = (s: string): ObjectId => s as ObjectId

/**
 * Generate a random ID with 72-bit entropy (12 base64url chars)
 */
function generateId(): string {
	const bytes = new Uint8Array(9)
	crypto.getRandomValues(bytes)
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.slice(0, 12)
}

/**
 * Generate a new ObjectId with 72-bit entropy
 */
export function generateObjectId(): ObjectId {
	return toObjectId(generateId())
}

// vim: ts=4
