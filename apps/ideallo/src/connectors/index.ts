// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Connector routing: bound arrow terminals, anchors and route derivation.
 */

export {
	ANCHOR_CODES,
	ANCHOR_NORMALIZED,
	anchorHandlePoints,
	anchorSideDir,
	anchorToLocal,
	anchorWorldPoint,
	freeAnchorFromPoint,
	nearestAnchorCode
} from './anchors.js'
export type { ArrowheadGeometry } from './arrowheads.js'
export {
	arrowheadBaseLength,
	arrowheadExtent,
	arrowheadGeometry,
	dirToVector
} from './arrowheads.js'
export type { BindLookupOptions, BindTarget } from './binding.js'
export {
	anchorForPoint,
	anchorSnapRadiusWorld,
	findBindTargetShape,
	pointInShape,
	resolveBindTarget,
	SNAP_SCREEN_PIXELS,
	shouldShowAllAnchors
} from './binding.js'
export { clearRouteCache, routeCacheSize } from './cache.js'
export type { ConnectorHandlePoints, TerminalHandlePoints } from './handles.js'
export { connectorHandlePoints } from './handles.js'
export { terminalHeadDirections } from './head-direction.js'
export type { ConnectorEndpointPreview } from './preview.js'
export { applyEndpointPreview } from './preview.js'
export type { ConnectorPreview, GeometryOverride, GeometryOverrides } from './resolve.js'
export {
	buildConnectorContext,
	isBindable,
	isBoundConnector,
	resolveArrow,
	resolveConnectorRoutes,
	resolvePreviewRoute,
	toShapeGeometry
} from './resolve.js'
export { routeArc } from './routing/arc.js'
export type { RouteRequest } from './routing/common.js'
export { analyticElbow, dockDistance, dockTerminal, routeElbow } from './routing/elbow.js'
export { routeStraight, standoffGap } from './routing/straight.js'
export {
	directionBetween,
	exitSegmentRect,
	intersectRayEllipse,
	intersectRayPolygon,
	intersectSegmentRect,
	intersectSegmentSegment,
	pointInRect,
	segmentPenetratesRect,
	shapeExitPoint,
	shapePadded
} from './shape-outline.js'
export type { ConnectorContext, Dir, ResolvedRoute, ShapeGeometry } from './types.js'
export { shapeBoundsCenter, shapeRotationCenter } from './types.js'

// vim: ts=4
