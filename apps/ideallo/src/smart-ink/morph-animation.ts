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
 * Morph Animation for Smart Ink
 *
 * Animates the transition from a freehand stroke to a detected shape.
 * The 250ms ease-out animation provides a delightful "magic" moment.
 */

import type { Point } from '../utils/geometry.js'
import { interpolatePaths, easeOut } from './path-processing/index.js'
import {
	generateLinePoints,
	generateEllipsePoints,
	generateRectanglePoints,
	generatePolygonPoints,
	generateArrowPoints,
	type LineCandidate,
	type EllipseCandidate,
	type RectangleCandidate,
	type PolygonCandidate,
	type ArrowCandidate
} from './shape-detectors/index.js'

// Animation configuration
export const MORPH_DURATION_MS = 250

export interface MorphAnimation {
	id: string // Animation ID (same as stroke ID)
	startTime: number // When animation started
	duration: number // Duration in ms
	fromPoints: Point[] // Original freehand points
	toPoints: Point[] // Target shape points
	style: {
		color: string
		width: number
	}
	onComplete: () => void // Callback when animation finishes
}

export interface MorphAnimationState {
	currentPoints: Point[]
	progress: number // 0-1
	isComplete: boolean
}

/**
 * Create a morph animation from freehand to line
 */
export function createLineMorphAnimation(
	strokeId: string,
	originalPoints: Point[],
	line: LineCandidate,
	style: { color: string; width: number },
	onComplete: () => void
): MorphAnimation {
	// Generate target line points with same count as original
	// for smooth point-by-point morphing
	const targetPoints = generateLinePoints(line.start, line.end, originalPoints.length)

	return {
		id: strokeId,
		startTime: performance.now(),
		duration: MORPH_DURATION_MS,
		fromPoints: originalPoints,
		toPoints: targetPoints,
		style,
		onComplete
	}
}

/**
 * Create a morph animation from freehand to ellipse
 */
export function createEllipseMorphAnimation(
	strokeId: string,
	originalPoints: Point[],
	ellipse: EllipseCandidate,
	style: { color: string; width: number },
	onComplete: () => void
): MorphAnimation {
	const targetPoints = generateEllipsePoints(ellipse, originalPoints.length)

	return {
		id: strokeId,
		startTime: performance.now(),
		duration: MORPH_DURATION_MS,
		fromPoints: originalPoints,
		toPoints: targetPoints,
		style,
		onComplete
	}
}

/**
 * Create a morph animation from freehand to rectangle
 */
export function createRectangleMorphAnimation(
	strokeId: string,
	originalPoints: Point[],
	rectangle: RectangleCandidate,
	style: { color: string; width: number },
	onComplete: () => void
): MorphAnimation {
	const targetPoints = generateRectanglePoints(rectangle, originalPoints.length)

	return {
		id: strokeId,
		startTime: performance.now(),
		duration: MORPH_DURATION_MS,
		fromPoints: originalPoints,
		toPoints: targetPoints,
		style,
		onComplete
	}
}

/**
 * Create a morph animation from freehand to polygon
 */
export function createPolygonMorphAnimation(
	strokeId: string,
	originalPoints: Point[],
	polygon: PolygonCandidate,
	style: { color: string; width: number },
	onComplete: () => void
): MorphAnimation {
	const targetPoints = generatePolygonPoints(polygon, originalPoints.length)

	return {
		id: strokeId,
		startTime: performance.now(),
		duration: MORPH_DURATION_MS,
		fromPoints: originalPoints,
		toPoints: targetPoints,
		style,
		onComplete
	}
}

/**
 * Create a morph animation from freehand to arrow
 */
export function createArrowMorphAnimation(
	strokeId: string,
	originalPoints: Point[],
	arrow: ArrowCandidate,
	style: { color: string; width: number },
	onComplete: () => void
): MorphAnimation {
	const targetPoints = generateArrowPoints(arrow, originalPoints.length)

	return {
		id: strokeId,
		startTime: performance.now(),
		duration: MORPH_DURATION_MS,
		fromPoints: originalPoints,
		toPoints: targetPoints,
		style,
		onComplete
	}
}

/**
 * Update morph animation state
 *
 * @returns Current animation state, or null if animation should be removed
 */
export function updateMorphAnimation(
	animation: MorphAnimation,
	currentTime: number
): MorphAnimationState | null {
	const elapsed = currentTime - animation.startTime
	const rawProgress = Math.min(elapsed / animation.duration, 1)
	const progress = easeOut(rawProgress)

	const currentPoints = interpolatePaths(animation.fromPoints, animation.toPoints, progress)

	const isComplete = rawProgress >= 1

	if (isComplete) {
		animation.onComplete()
	}

	return {
		currentPoints,
		progress,
		isComplete
	}
}

/**
 * Check if reduced motion is preferred
 * Used to skip animation for accessibility
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animation frame manager for multiple morph animations
 */
export class MorphAnimationManager {
	private animations: Map<string, MorphAnimation> = new Map()
	private frameId: number | null = null
	private onUpdate: (states: Map<string, MorphAnimationState>) => void

	constructor(onUpdate: (states: Map<string, MorphAnimationState>) => void) {
		this.onUpdate = onUpdate
	}

	/**
	 * Start a new morph animation
	 */
	start(animation: MorphAnimation): void {
		// If reduced motion is preferred, skip animation and call complete immediately
		if (prefersReducedMotion()) {
			animation.onComplete()
			return
		}

		this.animations.set(animation.id, animation)
		this.startAnimationLoop()
	}

	/**
	 * Cancel an animation
	 */
	cancel(id: string): void {
		this.animations.delete(id)
		if (this.animations.size === 0) {
			this.stopAnimationLoop()
		}
	}

	/**
	 * Cancel all animations
	 */
	cancelAll(): void {
		this.animations.clear()
		this.stopAnimationLoop()
	}

	private startAnimationLoop(): void {
		if (this.frameId !== null) return

		const loop = (currentTime: number) => {
			const states = new Map<string, MorphAnimationState>()
			const toRemove: string[] = []

			this.animations.forEach((animation, id) => {
				const state = updateMorphAnimation(animation, currentTime)
				if (state) {
					if (state.isComplete) {
						// Don't include completed animations in state update
						// (they've already called onComplete to commit the shape)
						toRemove.push(id)
					} else {
						states.set(id, state)
					}
				}
			})

			// Remove completed animations
			toRemove.forEach((id) => this.animations.delete(id))

			// Notify subscribers (only with in-progress animations)
			this.onUpdate(states)

			// Continue loop if there are active animations
			if (this.animations.size > 0) {
				this.frameId = requestAnimationFrame(loop)
			} else {
				this.frameId = null
			}
		}

		this.frameId = requestAnimationFrame(loop)
	}

	private stopAnimationLoop(): void {
		if (this.frameId !== null) {
			cancelAnimationFrame(this.frameId)
			this.frameId = null
		}
	}

	/**
	 * Cleanup on unmount
	 */
	destroy(): void {
		this.cancelAll()
	}
}

// vim: ts=4
