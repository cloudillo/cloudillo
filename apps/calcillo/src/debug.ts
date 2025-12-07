/**
 * Debug logging utilities for development mode only.
 * All logging is conditionally compiled out in production builds.
 */

// Development mode check - works in browser environments
// Set window.__SHEELLO_DEBUG__ = true in console to enable debug logging
const isDevelopment = (() => {
	// Check for global debug flag (can be set in browser console)
	if (typeof window !== 'undefined' && (window as any).__SHEELLO_DEBUG__) {
		return true
	}
	// In production builds, this will be replaced by bundlers
	// For esbuild: define: { 'process.env.NODE_ENV': '"production"' }
	try {
		// @ts-ignore - process.env is available at build time
		return typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'
	} catch {
		return false
	}
})()

/**
 * Debug logging - only outputs in development mode
 */
export const debug = {
	log: (...args: unknown[]): void => {
		if (isDevelopment) {
			console.log(...args)
		}
	},
	warn: (...args: unknown[]): void => {
		if (isDevelopment) {
			console.warn(...args)
		}
	},
	error: (...args: unknown[]): void => {
		// Always log errors, even in production
		console.error(...args)
	},
	group: (label: string): void => {
		if (isDevelopment) {
			console.group(label)
		}
	},
	groupEnd: (): void => {
		if (isDevelopment) {
			console.groupEnd()
		}
	}
}

// vim: ts=4
