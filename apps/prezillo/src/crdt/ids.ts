// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Branded ID types for compile-time safety
 * Using branded types ensures we don't accidentally mix up different ID types
 */

export type ObjectId = string & { readonly __brand: 'ObjectId' }
export type ContainerId = string & { readonly __brand: 'ContainerId' }
export type ViewId = string & { readonly __brand: 'ViewId' }
export type StyleId = string & { readonly __brand: 'StyleId' }
export type RichTextId = string & { readonly __brand: 'RichTextId' }
export type TemplateId = string & { readonly __brand: 'TemplateId' }

// Type converters
export const toObjectId = (s: string): ObjectId => s as ObjectId
export const toContainerId = (s: string): ContainerId => s as ContainerId
export const toViewId = (s: string): ViewId => s as ViewId
export const toStyleId = (s: string): StyleId => s as StyleId
export const toRichTextId = (s: string): RichTextId => s as RichTextId
export const toTemplateId = (s: string): TemplateId => s as TemplateId

/**
 * Generate a random ID with 72-bit entropy (12 base64url chars)
 * This provides collision resistance suitable for collaborative editing
 */
function generateId(length: number = 12): string {
	const bytes = new Uint8Array(Math.ceil((length * 6) / 8))
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
export const generateTemplateId = (): TemplateId => toTemplateId(generateId())

// vim: ts=4
