// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Camera Capture Message Handlers for Shell
 *
 * Handles camera capture messages from apps using ACK + push pattern:
 * - camera:capture.req - App requests to open camera
 * - camera:capture.ack - Shell immediately acknowledges camera is opening
 * - camera:capture.result - Shell pushes result when user captures/cancels
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type {
	CameraCaptureReq,
	CameraPreviewStart,
	CameraPreviewStop,
	CameraOverlayUpdate,
	OverlayItem
} from '@cloudillo/core'

/**
 * Camera capture options passed to the component
 */
export interface CameraCaptureOpenOptions {
	facing?: 'user' | 'environment'
	maxResolution?: number
}

/**
 * Camera capture result from the component
 */
export interface CameraCaptureResultData {
	imageData: string
	width: number
	height: number
}

/**
 * Callback type for opening the camera capture
 */
export type CameraCaptureCallback = (
	options: CameraCaptureOpenOptions,
	onResult: (result: CameraCaptureResultData | null) => void
) => void

/**
 * Callback type for starting preview frame streaming
 */
export type CameraPreviewStartCallback = (
	sessionId: string,
	appWindow: Window,
	options: { width?: number; height?: number; fps?: number }
) => void

/**
 * Callback type for stopping preview frame streaming
 */
export type CameraPreviewStopCallback = (sessionId: string) => void

/**
 * Callback type for overlay updates from app
 */
export type CameraOverlayCallback = (
	sessionId: string,
	frameSeq: number,
	overlays: OverlayItem[]
) => void

let openCameraCaptureCallback: CameraCaptureCallback | null = null
let previewStartCallback: CameraPreviewStartCallback | null = null
let previewStopCallback: CameraPreviewStopCallback | null = null
let overlayCallback: CameraOverlayCallback | null = null

/**
 * Register the camera capture callback
 * Called by the CameraCaptureDialog component when it mounts
 */
export function setCameraCaptureCallback(callback: CameraCaptureCallback | null): void {
	openCameraCaptureCallback = callback
}

/**
 * Register callbacks for camera preview and overlay
 * Called by the CameraCaptureDialog component
 */
export function setCameraPreviewCallbacks(callbacks: {
	onPreviewStart: CameraPreviewStartCallback | null
	onPreviewStop: CameraPreviewStopCallback | null
	onOverlay: CameraOverlayCallback | null
}): void {
	previewStartCallback = callbacks.onPreviewStart
	previewStopCallback = callbacks.onPreviewStop
	overlayCallback = callbacks.onOverlay
}

/**
 * Check if a camera capture callback is registered
 */
export function hasCameraCaptureCallback(): boolean {
	return openCameraCaptureCallback !== null
}

/**
 * Initialize camera message handlers on the shell bus
 */
// Track which app window owns each session
const sessionOwners = new Map<string, Window>()

/**
 * Clean up camera sessions owned by a given app window (called on app unregister)
 */
export function cleanupCameraSessions(appWindow: Window): void {
	for (const [sessionId, owner] of sessionOwners) {
		if (owner === appWindow) {
			sessionOwners.delete(sessionId)
		}
	}
}

export function initCameraHandlers(bus: ShellMessageBus): void {
	bus.on('camera:capture.req', async (msg: CameraCaptureReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Camera] Capture request with no source window')
			return
		}

		const sessionId = msg.payload.sessionId

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Camera] Capture request from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'camera:capture.ack',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		if (!openCameraCaptureCallback) {
			console.error('[Camera] No camera capture callback registered')
			bus.sendResponse(
				appWindow,
				'camera:capture.ack',
				msg.id,
				false,
				undefined,
				'Camera capture not available'
			)
			return
		}

		console.log('[Camera] Opening camera for app:', connection.appName, 'sessionId:', sessionId)

		// Bind session to the requesting app window
		sessionOwners.set(sessionId, appWindow)

		// Send ACK immediately
		bus.sendResponse(appWindow, 'camera:capture.ack', msg.id, true, { sessionId })

		// Open camera and wait for result
		openCameraCaptureCallback(
			{
				facing: msg.payload.facing,
				maxResolution: msg.payload.maxResolution
			},
			(result) => {
				sessionOwners.delete(sessionId)
				if (result) {
					console.log('[Camera] Capture result received')
					bus.sendNotify(appWindow, 'camera:capture.result', {
						sessionId,
						captured: true,
						imageData: result.imageData,
						width: result.width,
						height: result.height
					})
				} else {
					console.log('[Camera] Capture cancelled')
					bus.sendNotify(appWindow, 'camera:capture.result', {
						sessionId,
						captured: false
					})
				}
			}
		)
	})

	bus.on('camera:preview.start', (msg: CameraPreviewStart, source) => {
		const appWindow = source as Window
		if (!appWindow || !previewStartCallback) return

		const sessionId = msg.payload.sessionId
		const owner = sessionOwners.get(sessionId)
		if (owner && owner !== appWindow) {
			console.warn('[Camera] Preview start rejected: session belongs to another app')
			return
		}

		console.log('[Camera] Preview start requested, sessionId:', sessionId)
		previewStartCallback(sessionId, appWindow, {
			width: msg.payload.width,
			height: msg.payload.height,
			fps: msg.payload.fps
		})
	})

	bus.on('camera:preview.stop', (msg: CameraPreviewStop, source) => {
		if (!previewStopCallback) return

		const sessionId = msg.payload.sessionId
		const owner = sessionOwners.get(sessionId)
		if (owner && owner !== (source as Window)) {
			console.warn('[Camera] Preview stop rejected: session belongs to another app')
			return
		}

		console.log('[Camera] Preview stop requested, sessionId:', sessionId)
		previewStopCallback(sessionId)
	})

	bus.on('camera:overlay.update', (msg: CameraOverlayUpdate, source) => {
		if (!overlayCallback) return

		const sessionId = msg.payload.sessionId
		const owner = sessionOwners.get(sessionId)
		if (owner && owner !== (source as Window)) {
			console.warn('[Camera] Overlay update rejected: session belongs to another app')
			return
		}

		overlayCallback(sessionId, msg.payload.frameSeq, msg.payload.overlays)
	})
}

// vim: ts=4
