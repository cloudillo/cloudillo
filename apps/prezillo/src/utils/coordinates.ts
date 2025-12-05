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
 * Coordinate transformation utilities for canvas operations
 */

import type { SvgCanvasContext } from 'react-svg-canvas'

/**
 * Transforms screen/client coordinates to canvas coordinates (zoom-aware)
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
 * Transforms screen/client coordinates to canvas coordinates using a provided SVG element
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
 * Gets the SVG element from an event target
 *
 * @param target - The event target (typically from e.target)
 * @returns The owner SVG element, or null if not found
 */
export function getSvgElement(target: EventTarget | null): SVGSVGElement | null {
	if (!target || !(target instanceof SVGElement)) return null
	return target.ownerSVGElement
}

// vim: ts=4
