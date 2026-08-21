// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Branded ID type for compile-time safety
 * Uses 72-bit entropy (12 base64url chars) - sufficient for collaborative editing
 *
 * Note: ObjectId is used for objects, and also as keys in txt/geo maps.
 * Normal objects use their own ID as the key. Linked copies use explicit tid/gid
 * pointing to another object's ID (sharing the same text/geometry).
 */

import { randomId } from '@cloudillo/core'

export type ObjectId = string & { readonly __brand: 'ObjectId' }

export const toObjectId = (s: string): ObjectId => s as ObjectId

/**
 * Generate a new ObjectId with 72-bit entropy
 */
export function generateObjectId(): ObjectId {
	return toObjectId(randomId())
}

// vim: ts=4
