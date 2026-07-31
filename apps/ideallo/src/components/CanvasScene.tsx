// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Everything inside SvgCanvas' transformed <g> - the scene, as opposed to the screen-space fixed
 * layer Canvas keeps to itself.
 *
 * MEMOISED, and that is the whole reason this is a component rather than a block of JSX in Canvas'
 * return. Nothing here reads the matrix, so a pan is one `transform` attribute write and every
 * object below stays put. Without the boundary a pan WITH a selection re-rendered Canvas for the
 * screen-space overlay and reconciled every ObjectRenderer on the board, once per frame -
 * ObjectRenderer is not itself memoised.
 *
 * So EVERY PROP HERE MUST BE REFERENTIALLY STABLE across a matrix change, all the way up to the
 * <Canvas> call site in app.tsx. The comparison is React.memo's DEFAULT shallow one on purpose: a
 * hand-written areEqual - or a useMemo over these ~41 inputs - can go stale, and Biome's
 * useExhaustiveDependencies is off repo-wide (biome.jsonc), so nothing would catch it. A shallow
 * compare can only ever under-bail, which costs a wasted render and never a wrong pixel.
 *
 * The derived arrays arrive as PROPS rather than being recomputed here: Canvas needs
 * objectsToRender for its own fixed layer, and expanding the document twice per drag frame is the
 * one cost this boundary must not add.
 */

import * as React from 'react'

import type { ConnectorContext } from '../connectors/index.js'
import type { AnchorPointType, ConnectorObject, IdealloObject } from '../crdt/index.js'
import { isTextBearing } from '../crdt/index.js'
import { pointsToSmoothPath } from '../utils/index.js'
import { ActiveStroke } from './ActiveStroke.js'
import type { CanvasProps } from './Canvas.js'
import { ConnectorAnchorDots } from './ConnectorAnchorDots.js'
import { Cursors } from './Cursors.js'
import { GhostEditing } from './GhostEditing.js'
import { GhostShapes } from './GhostShapes.js'
import { GhostStrokes } from './GhostStrokes.js'
import { ObjectRenderer } from './ObjectRenderer.js'
import { ShapePreview } from './ShapePreview.js'
import { StickyShadowDefs } from './StickyShadowDefs.js'
import { UndoHint } from './UndoHint.js'

export interface CanvasSceneProps
	extends Pick<
		CanvasProps,
		| 'doc'
		| 'objects'
		| 'readOnly'
		| 'remotePresence'
		| 'activeTool'
		| 'selectedIds'
		| 'dragOffset'
		| 'hoveredId'
		| 'stackedHighlightIds'
		| 'editing'
		| 'onEditSave'
		| 'onEditDragStart'
		| 'onObjectDoubleClick'
		| 'shouldIgnoreEditorBlur'
		| 'onEditHeightChange'
		| 'quillRef'
		| 'ownerTag'
		| 'token'
		| 'sourceFileId'
		| 'activeDocumentId'
		| 'onDocumentActivate'
		| 'onDocumentViewStateChange'
		| 'activeStroke'
		| 'shapePreview'
		| 'connectorTarget'
		| 'morphAnimations'
		| 'currentStrokeStyle'
		| 'snappedHints'
		| 'onUndoSnapped'
		| 'eraserPosition'
		| 'eraserRadius'
		| 'eraserHighlightedIds'
		| 'isErasing'
	> {
	/** The only matrix-derived value the scene reads - a number, so a pan compares equal */
	scale: number
	objectsToRender: IdealloObject[]
	expandedObjects: IdealloObject[]
	connectorContext: ConnectorContext
	activeConnectorAnchor: AnchorPointType | null
	activeFreeAnchorPoint: [number, number] | null
	selectedConnector: ConnectorObject | null
	fullyBoundConnector: boolean
}

export const CanvasScene = React.memo(function CanvasScene({
	scale,
	objectsToRender,
	expandedObjects,
	connectorContext,
	activeConnectorAnchor,
	activeFreeAnchorPoint,
	selectedConnector,
	fullyBoundConnector,
	doc,
	objects,
	readOnly,
	remotePresence,
	activeTool,
	selectedIds,
	dragOffset,
	hoveredId,
	stackedHighlightIds,
	editing,
	onEditSave,
	onEditDragStart,
	onObjectDoubleClick,
	shouldIgnoreEditorBlur,
	onEditHeightChange,
	quillRef,
	ownerTag,
	token,
	sourceFileId,
	activeDocumentId,
	onDocumentActivate,
	onDocumentViewStateChange,
	activeStroke,
	shapePreview,
	connectorTarget,
	morphAnimations,
	currentStrokeStyle,
	snappedHints,
	onUndoSnapped,
	eraserPosition,
	eraserRadius,
	eraserHighlightedIds,
	isErasing
}: CanvasSceneProps) {
	return (
		<>
			<StickyShadowDefs />

			{/*
				A fully bound connector gets no SelectionBox, so this halo is what shows it is
				selected. Drawn BEHIND the objects - a semi-transparent band painted over the
				arrow would wash out its own stroke.
			*/}
			{!readOnly && fullyBoundConnector && selectedConnector?.route && (
				<path
					className="connector-route-highlight"
					d={selectedConnector.route.d}
					strokeWidth={selectedConnector.style.strokeWidth + 8 / scale}
					pointerEvents="none"
				/>
			)}

			{/* Render committed objects */}
			{/* Not done, deliberately: a nested CanvasObjects memo around just this block would
			    additionally keep pen-stroke, eraser and remote-presence frames off every renderer */}
			{objectsToRender.map((obj) => {
				const isEditing = editing?.id === obj.id
				return (
					<ObjectRenderer
						key={obj.id}
						object={obj}
						doc={doc}
						ownerTag={ownerTag}
						token={token}
						scale={scale}
						sourceFileId={sourceFileId}
						activeDocument={
							obj.type === 'document' && (readOnly || activeDocumentId === obj.id)
						}
						onDocumentViewStateChange={onDocumentViewStateChange}
						isEditing={isEditing}
						onSave={isEditing ? onEditSave : undefined}
						caretPoint={isEditing ? editing?.caretPoint : undefined}
						shouldIgnoreBlur={isEditing ? shouldIgnoreEditorBlur : undefined}
						onDragStart={
							isEditing && obj.type === 'sticky' && onEditDragStart
								? (e) => onEditDragStart(e, obj.id)
								: undefined
						}
						onDoubleClick={
							isTextBearing(obj.type) && onObjectDoubleClick
								? (e) => onObjectDoubleClick(obj.id, e)
								: obj.type === 'document' && onDocumentActivate
									? () => onDocumentActivate(obj.id)
									: undefined
						}
						quillRef={isEditing ? quillRef : undefined}
						/* Auto-grow is a TEXT CONTAINER behaviour: a sticky and a text label both
						   grow to fit their content, while a rect is a box the user sized on
						   purpose and its text clips. */
						onHeightChange={
							isEditing && (obj.type === 'sticky' || obj.type === 'text')
								? onEditHeightChange
								: undefined
						}
						isHighlighted={eraserHighlightedIds?.has(obj.id) ?? false}
						isEraserHovered={activeTool === 'eraser' && hoveredId === obj.id}
						isStacked={stackedHighlightIds?.has(obj.id) ?? false}
						isHovered={
							activeTool === 'select' &&
							!dragOffset &&
							hoveredId === obj.id &&
							!selectedIds.has(obj.id)
						}
					/>
				)
			})}

			{/* Render ghost strokes from remote users */}
			<GhostStrokes remotePresence={remotePresence} />

			{/* Render ghost shapes from remote users */}
			<GhostShapes remotePresence={remotePresence} connectorContext={connectorContext} />

			{/*
				Objects being edited (dragged) by remote users. `expandedObjects`, not
				`objectsToRender`: the ghost layer hands the resolver raw objects plus its own
				override map, and the latter has the local override already baked in - see the
				comment on resolveConnectorRoutes in Canvas.tsx.
			*/}
			<GhostEditing
				doc={doc}
				remotePresence={remotePresence}
				objects={objects}
				expandedObjects={expandedObjects}
				ownerTag={ownerTag}
				token={token}
			/>

			{/* Render remote user cursors */}
			<Cursors remotePresence={remotePresence} />

			{/* Render active stroke being drawn */}
			{activeStroke && <ActiveStroke stroke={activeStroke} />}

			{/* Render Smart Ink morph animations */}
			{morphAnimations && morphAnimations.size > 0 && (
				<g className="smart-ink-morphs">
					{Array.from(morphAnimations.entries()).map(([id, state]) => (
						<path
							key={id}
							d={pointsToSmoothPath(state.currentPoints as [number, number][])}
							fill="none"
							stroke={currentStrokeStyle?.color ?? '#1e1e1e'}
							strokeWidth={currentStrokeStyle?.width ?? 2}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					))}
				</g>
			)}

			{/* Render undo hints for snapped objects */}
			{snappedHints && snappedHints.size > 0 && onUndoSnapped && (
				<g className="smart-ink-undo-hints">
					{Array.from(snappedHints.entries()).map(([objectId, { bounds }]) => (
						<UndoHint
							key={objectId}
							bounds={bounds}
							onUndo={() => onUndoSnapped(objectId)}
						/>
					))}
				</g>
			)}

			{/* Render shape preview during creation */}
			{/* Drop-target affordance, under the preview so the line stays legible */}
			{!readOnly && connectorTarget && (
				<ConnectorAnchorDots
					shape={connectorTarget}
					scale={scale}
					activeAnchor={activeConnectorAnchor}
					freeAnchor={activeFreeAnchorPoint}
				/>
			)}

			{shapePreview && (
				<ShapePreview preview={shapePreview} connectorContext={connectorContext} />
			)}

			{/* Render eraser cursor */}
			{activeTool === 'eraser' && eraserPosition && (
				<g className="eraser-cursor" pointerEvents="none">
					{/* Outer circle (eraser brush area) */}
					<circle
						cx={eraserPosition.x}
						cy={eraserPosition.y}
						r={eraserRadius}
						fill={isErasing ? 'rgba(255, 100, 100, 0.2)' : 'rgba(255, 100, 100, 0.1)'}
						stroke="#ff6666"
						strokeWidth={2 / scale}
						strokeDasharray={isErasing ? 'none' : `${4 / scale} ${4 / scale}`}
					/>
					{/* Center crosshair - horizontal */}
					<line
						x1={eraserPosition.x - 6 / scale}
						y1={eraserPosition.y}
						x2={eraserPosition.x + 6 / scale}
						y2={eraserPosition.y}
						stroke="#ff6666"
						strokeWidth={1.5 / scale}
						strokeLinecap="round"
					/>
					{/* Center crosshair - vertical */}
					<line
						x1={eraserPosition.x}
						y1={eraserPosition.y - 6 / scale}
						x2={eraserPosition.x}
						y2={eraserPosition.y + 6 / scale}
						stroke="#ff6666"
						strokeWidth={1.5 / scale}
						strokeLinecap="round"
					/>
				</g>
			)}
		</>
	)
})

// vim: ts=4
