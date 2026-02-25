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
 * Sensor Message Handlers for Shell
 *
 * Handles device sensor access on behalf of sandboxed iframes
 * (which cannot access DeviceOrientation API due to opaque origins).
 *
 * - sensor:compass.sub - App subscribes/unsubscribes to compass heading
 * - sensor:compass.push - Shell pushes heading updates to subscribed apps
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { SensorCompassSub } from '@cloudillo/core'

// Set of subscribed app windows
const compassSubscribers = new Set<Window>()

// Active device orientation listener (shared across all subscribers)
let orientationCleanup: (() => void) | null = null

// Heading smoothing (adaptive EMA with circular wrapping)
let smoothedHeading: number | null = null
const ALPHA_MOVING = 0.15 // Light smoothing while turning
const ALPHA_STABLE = 0.02 // Heavy smoothing when stationary

// Variance tracker to detect stable vs moving
let varianceEma = 0
const VARIANCE_ALPHA = 0.1
const STABLE_THRESHOLD = 4 // Below this variance → phone is still (≈ 2° std dev)

// Throttle postMessage pushes to ~15 Hz (EMA still sees every raw event)
let lastPushTime = 0
const PUSH_INTERVAL_MS = 66

// Lock heading: when stable, only push if heading drifts beyond this
let lockedHeading: number | null = null
const LOCK_DEG = 1

function smoothHeading(raw: number): number {
	if (smoothedHeading == null) {
		smoothedHeading = raw
		return raw
	}
	// Angular diff from current smoothed value
	let diff = raw - smoothedHeading
	if (diff > 180) diff -= 360
	if (diff < -180) diff += 360

	// Update variance estimate
	varianceEma += VARIANCE_ALPHA * (diff * diff - varianceEma)

	// Pick smoothing factor based on stability
	const alpha = varianceEma < STABLE_THRESHOLD ? ALPHA_STABLE : ALPHA_MOVING
	smoothedHeading = (smoothedHeading + alpha * diff + 360) % 360
	return smoothedHeading
}

/**
 * Request iOS DeviceOrientation permission if needed.
 * Returns true if permission is granted or not required.
 */
async function requestOrientationPermission(): Promise<boolean> {
	const DOE = DeviceOrientationEvent as any
	if (typeof DOE.requestPermission === 'function') {
		try {
			const result = await DOE.requestPermission()
			console.log('[Sensor] iOS DeviceOrientation permission:', result)
			return result === 'granted'
		} catch (err) {
			console.warn('[Sensor] iOS permission request failed:', err)
			return false
		}
	}
	// Not iOS or permission not required
	return true
}

/**
 * Start listening for device orientation if not already
 */
function startOrientationListener(bus: ShellMessageBus): void {
	if (orientationCleanup) return

	const hasAbsolute = 'ondeviceorientationabsolute' in window
	const hasOrientation = 'ondeviceorientation' in window

	if (!hasAbsolute && !hasOrientation) {
		console.warn('[Sensor] DeviceOrientation API not available')
		return
	}

	let activeEvent = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation'
	let eventCount = 0
	let usefulCount = 0
	let fellBack = false

	const handler = (evt: DeviceOrientationEvent) => {
		eventCount++
		let heading: number | null = null
		let absolute = false

		// iOS provides webkitCompassHeading directly
		const webkitHeading: number | null = (evt as any).webkitCompassHeading ?? null
		if (webkitHeading != null) {
			heading = webkitHeading
			absolute = true
		} else if (evt.absolute && evt.alpha != null) {
			heading = (360 - evt.alpha) % 360
			absolute = true
		} else if (evt.alpha != null) {
			// Non-absolute fallback
			heading = (360 - evt.alpha) % 360
			absolute = false
		}

		if (heading == null) return
		usefulCount++

		// Apply smoothing (sees every raw event for accuracy)
		const smoothed = smoothHeading(heading)

		// Throttle postMessage pushes to ~15 Hz
		const now = performance.now()
		if (now - lastPushTime < PUSH_INTERVAL_MS) return
		lastPushTime = now

		// When stable, lock heading and suppress noise drift
		if (varianceEma < STABLE_THRESHOLD) {
			if (lockedHeading == null) lockedHeading = smoothed
			let lockDiff = smoothed - lockedHeading
			if (lockDiff > 180) lockDiff -= 360
			if (lockDiff < -180) lockDiff += 360
			if (Math.abs(lockDiff) < LOCK_DEG) return
			// Drifted past lock — update lock and push
			lockedHeading = smoothed
		} else {
			lockedHeading = null
		}

		for (const appWindow of compassSubscribers) {
			bus.sendNotify(appWindow, 'sensor:compass.push', { heading: smoothed, absolute })
		}
	}

	window.addEventListener(activeEvent, handler as EventListener)

	// If absolute events don't produce useful headings within 1.5s, fall back
	let fallbackTimeout: ReturnType<typeof setTimeout> | undefined
	if (hasAbsolute && hasOrientation) {
		fallbackTimeout = setTimeout(() => {
			if (usefulCount === 0) {
				console.log(
					'[Sensor] No useful headings from',
					activeEvent,
					'after',
					eventCount,
					'events, falling back to deviceorientation'
				)
				window.removeEventListener(activeEvent, handler as EventListener)
				activeEvent = 'deviceorientation'
				fellBack = true
				window.addEventListener(activeEvent, handler as EventListener)
			}
		}, 1500)
	}

	orientationCleanup = () => {
		window.removeEventListener(activeEvent, handler as EventListener)
		if (fallbackTimeout) clearTimeout(fallbackTimeout)
		smoothedHeading = null
		lockedHeading = null
		varianceEma = 0
		orientationCleanup = null
		console.log(
			'[Sensor] Orientation listener stopped (event:',
			activeEvent + (fellBack ? ' fallback' : '') + ',',
			eventCount,
			'total events,',
			usefulCount,
			'useful)'
		)
	}

	console.log('[Sensor] Orientation listener started, trying:', activeEvent)
}

/**
 * Stop the orientation listener if no more subscribers
 */
function stopOrientationListenerIfEmpty(): void {
	if (compassSubscribers.size === 0 && orientationCleanup) {
		orientationCleanup()
	}
}

/**
 * Initialize sensor message handlers on the shell bus
 */
export function initSensorHandlers(bus: ShellMessageBus): void {
	bus.on('sensor:compass.sub', async (msg: SensorCompassSub, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Sensor] Compass subscription with no source window')
			return
		}

		if (msg.payload.enabled) {
			// Request iOS permission before starting orientation listener
			const granted = await requestOrientationPermission()
			if (!granted) {
				bus.sendResponse(
					appWindow,
					'sensor:compass.sub.res',
					msg.id,
					false,
					undefined,
					'Permission denied'
				)
				console.warn('[Sensor] Compass permission denied')
				return
			}

			compassSubscribers.add(appWindow)
			startOrientationListener(bus)
			bus.sendResponse(appWindow, 'sensor:compass.sub.res', msg.id, true)
			console.log('[Sensor] Compass subscriber added, total:', compassSubscribers.size)
		} else {
			compassSubscribers.delete(appWindow)
			stopOrientationListenerIfEmpty()
			bus.sendResponse(appWindow, 'sensor:compass.sub.res', msg.id, true)
			console.log('[Sensor] Compass subscriber removed, total:', compassSubscribers.size)
		}
	})
}

// vim: ts=4
