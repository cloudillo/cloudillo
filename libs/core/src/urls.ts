// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
export function getFileUrl(
	idTag: string,
	fileId: string,
	variant?: string,
	opts?: { token?: string }
): string {
	const base = `${getInstanceUrl(idTag)}/api/files/${fileId}`
	const params = new URLSearchParams()
	if (variant) params.append('variant', variant)
	if (opts?.token) params.append('token', opts.token)
	return params.size ? `${base}?${params}` : base
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
 * Generate a store file ID for an app.
 * Store files (`s~{appId}`) are auto-created by the server on first
 * CRDT or RTDB WebSocket connection.
 *
 * @param appId - App identifier (e.g., "taskillo", "notillo")
 * @returns Store file ID like "s~taskillo"
 */
export function getStoreFileId(appId: string): string {
	return `s~${appId}`
}

/**
 * Generate a meta database ID for a document.
 * Meta databases (`{fileId}~meta`) store comments and other metadata
 * separate from the document content. They are auto-created by the server
 * on first RTDB WebSocket connection.
 *
 * @param fileId - File identifier of the parent document
 * @returns Meta database ID like "abc123~meta"
 */
export function getMetaDbId(fileId: string): string {
	return `${fileId}~meta`
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
	const contextIndex = (IMAGE_VARIANT_QUALITY_ORDER as readonly string[]).indexOf(defaultVariant)
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

/**
 * Variant pixel thresholds (approximate max dimension for each variant)
 */
const VARIANT_SIZE_THRESHOLDS = {
	'vis.tn': 150,
	'vis.sd': 640,
	'vis.md': 1280,
	'vis.hd': 1920,
	'vis.xd': Infinity
} as const

/**
 * Get optimal image variant for a given display size in pixels.
 * Useful for canvas/SVG apps where display size = canvas size * zoom scale.
 *
 * @param displayWidth - Width in screen pixels
 * @param displayHeight - Height in screen pixels
 * @returns The optimal variant string (e.g., 'vis.sd', 'vis.hd')
 *
 * @example
 * // For a 300x200 canvas object at 2x zoom (600x400 screen pixels)
 * const variant = getImageVariantForDisplaySize(600, 400) // returns 'vis.sd'
 */
export function getImageVariantForDisplaySize(displayWidth: number, displayHeight: number): string {
	const maxDimension = Math.max(displayWidth, displayHeight)

	if (maxDimension <= VARIANT_SIZE_THRESHOLDS['vis.tn']) return 'vis.tn'
	if (maxDimension <= VARIANT_SIZE_THRESHOLDS['vis.sd']) return 'vis.sd'
	if (maxDimension <= VARIANT_SIZE_THRESHOLDS['vis.md']) return 'vis.md'
	if (maxDimension <= VARIANT_SIZE_THRESHOLDS['vis.hd']) return 'vis.hd'
	return 'vis.xd'
}

// vim: ts=4
