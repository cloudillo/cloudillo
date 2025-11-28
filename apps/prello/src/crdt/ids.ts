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
 * Branded ID types for compile-time safety
 * Using branded types ensures we don't accidentally mix up different ID types
 */

export type ObjectId = string & { readonly __brand: 'ObjectId' }
export type ContainerId = string & { readonly __brand: 'ContainerId' }
export type ViewId = string & { readonly __brand: 'ViewId' }
export type StyleId = string & { readonly __brand: 'StyleId' }
export type RichTextId = string & { readonly __brand: 'RichTextId' }

// Type converters
export const toObjectId = (s: string): ObjectId => s as ObjectId
export const toContainerId = (s: string): ContainerId => s as ContainerId
export const toViewId = (s: string): ViewId => s as ViewId
export const toStyleId = (s: string): StyleId => s as StyleId
export const toRichTextId = (s: string): RichTextId => s as RichTextId

/**
 * Generate a random ID with 72-bit entropy (12 base64url chars)
 * This provides collision resistance suitable for collaborative editing
 */
function generateId(length: number = 12): string {
	const bytes = new Uint8Array(Math.ceil(length * 6 / 8))
	crypto.getRandomValues(bytes)
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '')
		.slice(0, length)
}

export const generateObjectId = (): ObjectId => toObjectId(generateId())
export const generateContainerId = (): ContainerId => toContainerId(generateId())
export const generateViewId = (): ViewId => toViewId(generateId())
export const generateStyleId = (): StyleId => toStyleId(generateId())
export const generateRichTextId = (): RichTextId => toRichTextId(generateId())

// vim: ts=4
