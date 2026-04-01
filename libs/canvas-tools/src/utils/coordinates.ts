// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Coordinate transformation utilities for canvas operations.
 *
 * These utilities wrap SvgCanvasContext to provide convenient
 * screen-to-canvas coordinate transformation.
 */

import type { SvgCanvasContext } from 'react-svg-canvas'

/**
 * Transforms screen/client coordinates to canvas coordinates (zoom-aware).
 *
 * This is a commonly used pattern for getting canvas coordinates from mouse events.
 * It handles the SVG element lookup, bounding rect calculation, and zoom transformation.
 *
 * @param e - Mouse event (native or React)
 * @param canvasContext - The SvgCanvas context containing the translateTo function
 * @returns Tuple of [x, y] canvas coordinates, or null if transformation fails
 */
export function getCanvasCoordinates(
	e: MouseEvent | React.MouseEvent,
	canvasContext: SvgCanvasContext | null
): [number, number] | null {
	const svgElement = (e.target as SVGElement).ownerSVGElement
	if (!svgElement) return null

	if (!canvasContext?.translateTo) return null

	const rect = svgElement.getBoundingClientRect()
	return canvasContext.translateTo(e.clientX - rect.left, e.clientY - rect.top)
}

/**
 * Transforms screen/client coordinates to canvas coordinates using a provided SVG element.
 *
 * Use this variant when you already have a reference to the SVG element (e.g., from
 * the initial mousedown event) and need to transform coordinates in subsequent
 * mousemove events.
 *
 * @param e - Mouse event (native or React)
 * @param svgElement - The SVG element to use for bounding rect calculation
 * @param canvasContext - The SvgCanvas context containing the translateTo function
 * @returns Tuple of [x, y] canvas coordinates, or null if transformation fails
 */
export function getCanvasCoordinatesWithElement(
	e: MouseEvent | React.MouseEvent,
	svgElement: SVGSVGElement,
	canvasContext: SvgCanvasContext | null
): [number, number] | null {
	if (!canvasContext?.translateTo) return null

	const rect = svgElement.getBoundingClientRect()
	return canvasContext.translateTo(e.clientX - rect.left, e.clientY - rect.top)
}

/**
 * Gets the SVG element from an event target.
 *
 * @param target - The event target (typically from e.target)
 * @returns The owner SVG element, or null if not found
 */
export function getSvgElement(target: EventTarget | null): SVGSVGElement | null {
	if (!target || !(target instanceof SVGElement)) return null
	return target.ownerSVGElement
}

// vim: ts=4
