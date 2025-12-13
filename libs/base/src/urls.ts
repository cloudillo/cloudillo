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
 * Build the base URL for a Cloudillo instance
 * @param idTag - Identity tag of the tenant
 * @returns Base URL like "https://cl-o.alice.cloudillo.net"
 */
export function getInstanceUrl(idTag: string): string {
	return `https://cl-o.${idTag}`
}

/**
 * Build URL for file access with optional variant
 * @param idTag - Identity tag of the tenant
 * @param fileId - File ID
 * @param variant - Optional variant (e.g., "vis.sd", "vis.tn", "vid.hd")
 * @returns Full file URL
 */
export function getFileUrl(idTag: string, fileId: string, variant?: string): string {
	const base = `${getInstanceUrl(idTag)}/api/files/${fileId}`
	return variant ? `${base}?variant=${variant}` : base
}

/**
 * Build the API base URL for a Cloudillo instance
 * @param idTag - Identity tag of the tenant
 * @returns API URL like "https://cl-o.alice.cloudillo.net/api"
 */
export function getApiUrl(idTag: string): string {
	return `${getInstanceUrl(idTag)}/api`
}

/**
 * Build the WebSocket base URL for a Cloudillo instance
 * @param idTag - Identity tag of the tenant
 * @returns WebSocket URL like "wss://cl-o.alice.cloudillo.net"
 */
export function getWsUrl(idTag: string): string {
	return getInstanceUrl(idTag).replace('https:', 'wss:')
}

/**
 * Build the CRDT WebSocket URL for collaborative editing
 * @param idTag - Identity tag of the tenant
 * @returns CRDT WebSocket URL like "wss://cl-o.alice.cloudillo.net/ws/crdt"
 */
export function getCrdtUrl(idTag: string): string {
	return `${getWsUrl(idTag)}/ws/crdt`
}

/**
 * Build the RTDB WebSocket URL for real-time database
 * @param idTag - Identity tag of the tenant
 * @param fileId - File ID for the RTDB
 * @param token - Authentication token
 * @returns RTDB WebSocket URL with token query parameter
 */
export function getRtdbUrl(idTag: string, fileId: string, token: string): string {
	return `${getWsUrl(idTag)}/ws/rtdb/${fileId}?token=${encodeURIComponent(token)}`
}

/**
 * Build the Message Bus WebSocket URL
 * @param idTag - Identity tag of the tenant
 * @param token - Authentication token
 * @returns Message Bus WebSocket URL with token query parameter
 */
export function getMessageBusUrl(idTag: string, token: string): string {
	return `${getWsUrl(idTag)}/ws/bus?token=${encodeURIComponent(token)}`
}

/**
 * Image variant quality order from highest to lowest
 */
const IMAGE_VARIANT_QUALITY_ORDER = ['vis.xd', 'vis.hd', 'vis.md', 'vis.sd', 'vis.tn'] as const

/**
 * Video variant quality order from highest to lowest
 */
const VIDEO_VARIANT_QUALITY_ORDER = ['vid.xd', 'vid.hd', 'vid.md', 'vid.sd'] as const

export type ImageVariantContext = 'thumbnail' | 'preview' | 'fullscreen'

/**
 * Get the optimal image variant based on context and available local variants
 * @param context - Usage context: 'thumbnail' for small previews, 'preview' for medium display, 'fullscreen' for lightbox/full
 * @param localVariants - Optional array of variants available locally
 * @returns The best variant to use
 */
export function getOptimalImageVariant(
	context: ImageVariantContext,
	localVariants?: string[]
): string {
	// Default variants for each context
	const contextDefaults: Record<ImageVariantContext, string> = {
		thumbnail: 'vis.tn',
		preview: 'vis.sd',
		fullscreen: 'vis.hd'
	}

	const defaultVariant = contextDefaults[context]

	// If no local variants specified, use context default
	if (!localVariants?.length) return defaultVariant

	// For fullscreen, find the highest quality available
	if (context === 'fullscreen') {
		for (const variant of IMAGE_VARIANT_QUALITY_ORDER) {
			if (localVariants.includes(variant)) return variant
		}
	}

	// For preview/thumbnail, prefer the context default if available
	if (localVariants.includes(defaultVariant)) return defaultVariant

	// Fallback: find closest quality variant
	const contextIndex = IMAGE_VARIANT_QUALITY_ORDER.indexOf(defaultVariant as any)
	if (contextIndex >= 0) {
		// Try lower quality first (for thumbnails/preview)
		for (let i = contextIndex; i < IMAGE_VARIANT_QUALITY_ORDER.length; i++) {
			if (localVariants.includes(IMAGE_VARIANT_QUALITY_ORDER[i])) {
				return IMAGE_VARIANT_QUALITY_ORDER[i]
			}
		}
		// Then try higher quality
		for (let i = contextIndex - 1; i >= 0; i--) {
			if (localVariants.includes(IMAGE_VARIANT_QUALITY_ORDER[i])) {
				return IMAGE_VARIANT_QUALITY_ORDER[i]
			}
		}
	}

	// Ultimate fallback: first available variant
	return localVariants[0]
}

/**
 * Get the optimal video variant based on context
 * @param context - Usage context: 'preview' for poster/thumbnail, 'fullscreen' for playback
 * @param localVariants - Optional array of variants available locally
 * @returns The best variant to use
 */
export function getOptimalVideoVariant(
	context: 'preview' | 'fullscreen',
	localVariants?: string[]
): string {
	const defaultVariant = context === 'preview' ? 'vid.sd' : 'vid.hd'

	if (!localVariants?.length) return defaultVariant

	// For fullscreen, find highest quality
	if (context === 'fullscreen') {
		for (const variant of VIDEO_VARIANT_QUALITY_ORDER) {
			if (localVariants.includes(variant)) return variant
		}
	}

	if (localVariants.includes(defaultVariant)) return defaultVariant

	// Fallback
	return localVariants[0]
}

// vim: ts=4
