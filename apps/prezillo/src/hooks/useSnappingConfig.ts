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
 * Hook to get snap configuration from document metadata
 */

import * as React from 'react'
import type { YPrezilloDocument } from '../crdt'
import type { SnapConfiguration } from 'react-svg-canvas'

const DEFAULT_SNAP_WEIGHTS = {
	distance: 10,
	direction: 0, // Disabled - was confusing
	velocity: 2,
	grabProximity: 5,
	hierarchy: 4,
	edgePriority: 1.2,
	centerPriority: 1.0,
	gridPriority: 0.8,
	sizePriority: 0.9,
	distributionPriority: 1.1
}

const DEFAULT_GUIDES_CONFIG = {
	color: '#ff3366',
	strokeWidth: 1,
	showDistanceIndicators: true
}

const DEFAULT_DEBUG_CONFIG = {
	enabled: false,
	showTopN: 5,
	showScores: true,
	showScoreBreakdown: false
}

/**
 * Read snap configuration from Prezillo document metadata
 */
export function useSnappingConfig(doc: YPrezilloDocument): SnapConfiguration {
	// Subscribe to meta changes - use counter to force re-render
	const [version, forceUpdate] = React.useReducer((x) => x + 1, 0)

	React.useEffect(() => {
		const meta = doc.m
		const handler = () => forceUpdate()
		meta.observe(handler)
		return () => meta.unobserve(handler)
	}, [doc.m])

	// Include version in deps to recalculate when YMap changes
	return React.useMemo(() => {
		const meta = doc.m

		return {
			enabled: (meta.get('snapEnabled') as boolean) ?? true,
			snapToGrid: (meta.get('snapToGrid') as boolean) ?? false,
			snapToObjects: (meta.get('snapToObjects') as boolean) ?? true,
			snapToSizes: (meta.get('snapToSizes') as boolean) ?? true,
			snapToDistribution: (meta.get('snapToDistribution') as boolean) ?? true,
			gridSize: (meta.get('gridSize') as number) ?? 10,
			snapThreshold: (meta.get('snapThreshold') as number) ?? 8,
			weights: DEFAULT_SNAP_WEIGHTS,
			guides: DEFAULT_GUIDES_CONFIG,
			debug: {
				...DEFAULT_DEBUG_CONFIG,
				enabled: (meta.get('snapDebug') as boolean) ?? false
			}
		}
	}, [doc.m, version])
}

/**
 * Get the parent ID for an object (for hierarchy weighting)
 */
export function useGetParent(doc: YPrezilloDocument): (id: string) => string | undefined {
	return React.useCallback(
		(id: string) => {
			// Check if it's an object
			const obj = doc.o.get(id)
			if (obj?.p) return obj.p

			// Check if it's a container
			const container = doc.c.get(id)
			if (container?.p) return container.p

			return undefined
		},
		[doc]
	)
}

/**
 * Hook to get and set snap settings
 */
export interface SnapSettings {
	snapToGrid: boolean
	snapToObjects: boolean
	snapToSizes: boolean
	snapToDistribution: boolean
	snapDebug: boolean
}

export interface UseSnapSettingsResult {
	settings: SnapSettings
	setSnapToGrid: (enabled: boolean) => void
	setSnapToObjects: (enabled: boolean) => void
	setSnapToSizes: (enabled: boolean) => void
	setSnapToDistribution: (enabled: boolean) => void
	setSnapDebug: (enabled: boolean) => void
	toggleSnapToGrid: () => void
	toggleSnapToObjects: () => void
	toggleSnapToSizes: () => void
	toggleSnapToDistribution: () => void
	toggleSnapDebug: () => void
}

// Default values for snap settings
const SNAP_DEFAULTS: Record<string, boolean> = {
	snapToGrid: false,
	snapToObjects: true,
	snapToSizes: true,
	snapToDistribution: true,
	snapDebug: false
}

export function useSnapSettings(doc: YPrezilloDocument): UseSnapSettingsResult {
	// Subscribe to meta changes - use counter to force re-render
	const [version, forceUpdate] = React.useReducer((x) => x + 1, 0)

	React.useEffect(() => {
		const meta = doc.m
		const handler = () => forceUpdate()
		meta.observe(handler)
		return () => meta.unobserve(handler)
	}, [doc.m])

	// Include version in deps to recalculate when YMap changes
	const settings = React.useMemo<SnapSettings>(() => {
		const meta = doc.m
		return {
			snapToGrid: (meta.get('snapToGrid') as boolean) ?? SNAP_DEFAULTS.snapToGrid,
			snapToObjects: (meta.get('snapToObjects') as boolean) ?? SNAP_DEFAULTS.snapToObjects,
			snapToSizes: (meta.get('snapToSizes') as boolean) ?? SNAP_DEFAULTS.snapToSizes,
			snapToDistribution:
				(meta.get('snapToDistribution') as boolean) ?? SNAP_DEFAULTS.snapToDistribution,
			snapDebug: (meta.get('snapDebug') as boolean) ?? SNAP_DEFAULTS.snapDebug
		}
	}, [doc.m, version])

	// Factory for creating setter callbacks
	const createSetter = React.useCallback(
		(key: string) => (enabled: boolean) => doc.m.set(key, enabled),
		[doc.m]
	)

	// Factory for creating toggle callbacks
	const createToggle = React.useCallback(
		(key: string) => () => {
			const current = (doc.m.get(key) as boolean) ?? SNAP_DEFAULTS[key]
			doc.m.set(key, !current)
		},
		[doc.m]
	)

	// Create all setters and toggles using factories
	const setSnapToGrid = React.useMemo(() => createSetter('snapToGrid'), [createSetter])
	const setSnapToObjects = React.useMemo(() => createSetter('snapToObjects'), [createSetter])
	const setSnapToSizes = React.useMemo(() => createSetter('snapToSizes'), [createSetter])
	const setSnapToDistribution = React.useMemo(
		() => createSetter('snapToDistribution'),
		[createSetter]
	)
	const setSnapDebug = React.useMemo(() => createSetter('snapDebug'), [createSetter])

	const toggleSnapToGrid = React.useMemo(() => createToggle('snapToGrid'), [createToggle])
	const toggleSnapToObjects = React.useMemo(() => createToggle('snapToObjects'), [createToggle])
	const toggleSnapToSizes = React.useMemo(() => createToggle('snapToSizes'), [createToggle])
	const toggleSnapToDistribution = React.useMemo(
		() => createToggle('snapToDistribution'),
		[createToggle]
	)
	const toggleSnapDebug = React.useMemo(() => createToggle('snapDebug'), [createToggle])

	return {
		settings,
		setSnapToGrid,
		setSnapToObjects,
		setSnapToSizes,
		setSnapToDistribution,
		setSnapDebug,
		toggleSnapToGrid,
		toggleSnapToObjects,
		toggleSnapToSizes,
		toggleSnapToDistribution,
		toggleSnapDebug
	}
}

// vim: ts=4
