// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Dispatcher component that renders the appropriate component for each object type
 * Applies rotation transform around object's pivot point
 */

import type { CaretPoint } from '@cloudillo/canvas-text'
import { SvgDocumentEmbed } from '@cloudillo/react'
import type Quill from 'quill'
import * as React from 'react'

import type { IdealloObject, TextBearingObject, YIdealloDocument } from '../crdt/index.js'
import { getObjectYText, toObjectId } from '../crdt/index.js'
import { getRotationCenter } from '../utils/bounds.js'
import { isPaintSet } from '../utils/paint.js'
import { colorToCss } from '../utils/palette.js'
import { FreehandPath } from './FreehandPath.js'
import { ImageRenderer } from './ImageRenderer.js'
import { ObjectTextDisplay } from './ObjectTextDisplay.js'
import { ObjectTextEditOverlay } from './ObjectTextEditOverlay.js'
import {
	ConnectorRenderer,
	EllipseRenderer,
	PolygonRenderer,
	RectRenderer
} from './ShapeRenderer.js'
import { StickyEditOverlay } from './StickyEditOverlay.js'
import { StickyNote } from './StickyNote.js'
import { TextEditOverlay } from './TextEditOverlay.js'
import { TextLabel } from './TextLabel.js'

export interface ObjectRendererProps {
	object: IdealloObject
	/** Document for accessing Y.Text content */
	doc?: YIdealloDocument
	// Owner tag for image URLs
	ownerTag?: string
	// Access token for iframe-sandboxed image fetches
	token?: string
	// Current canvas scale/zoom for optimal image variant selection
	scale?: number
	// Source file ID for document embedding
	sourceFileId?: string
	// Sticky/text editing props (passed when this object is being edited)
	isEditing?: boolean
	onSave?: () => void
	/** Where the pointer was when editing started, so the caret lands there */
	caretPoint?: CaretPoint
	/** Blur into the property bar is the user styling what they are editing, not leaving it */
	shouldIgnoreBlur?: () => boolean
	onDragStart?: (e: React.PointerEvent) => void
	// Double-click handler for entering edit mode. Carries the event so the editor it opens can
	// put the caret where the user actually clicked.
	onDoubleClick?: (e: React.MouseEvent) => void
	// Quill ref for text formatting from PropertyBar
	quillRef?: React.MutableRefObject<Quill | null>
	// Callback when editor content height changes (for auto-grow)
	onHeightChange?: (height: number) => void
	// Whether this document embed is active (interactive)
	activeDocument?: boolean
	// Eraser highlight (object is under eraser brush during drag)
	isHighlighted?: boolean
	// Hover effect (object is under cursor in select mode)
	isHovered?: boolean
	// Eraser hover effect (object is under eraser cursor)
	isEraserHovered?: boolean
	// Stacked move highlight (object will move together with dragged object)
	isStacked?: boolean
	// Callback when an embedded document reports view state changes
	onDocumentViewStateChange?: (
		objectId: string,
		viewState: string,
		aspectRatio?: [number, number],
		aspectFixed?: boolean
	) => void
}

type RenderProps = Pick<
	ObjectRendererProps,
	| 'doc'
	| 'ownerTag'
	| 'token'
	| 'scale'
	| 'sourceFileId'
	| 'isEditing'
	| 'onSave'
	| 'caretPoint'
	| 'shouldIgnoreBlur'
	| 'onDragStart'
	| 'quillRef'
	| 'onHeightChange'
	| 'activeDocument'
	| 'isHovered'
	| 'isEraserHovered'
	| 'onDocumentViewStateChange'
>

/** A shape's optional label, in display or edit form */
function renderObjectText(object: TextBearingObject, props: RenderProps): React.ReactNode {
	const yText = props.doc ? getObjectYText(props.doc, toObjectId(object.id)) : undefined
	if (props.isEditing && props.onSave) {
		return (
			<ObjectTextEditOverlay
				object={object}
				yText={yText}
				onSave={props.onSave}
				caretPoint={props.caretPoint}
				shouldIgnoreBlur={props.shouldIgnoreBlur}
				quillRef={props.quillRef}
			/>
		)
	}
	return <ObjectTextDisplay object={object} yText={yText} />
}

// Render the appropriate component for the object type
function renderObject(object: IdealloObject, props: RenderProps): React.ReactNode {
	switch (object.type) {
		case 'freehand':
			return <FreehandPath object={object} />
		// The three shapes COMPOSE their label over the shape renderer rather than swapping it
		// out, so the shape keeps exactly one source of truth for its own appearance.
		case 'rect':
			return (
				<>
					<RectRenderer object={object} />
					{renderObjectText(object, props)}
				</>
			)
		case 'ellipse':
			return (
				<>
					<EllipseRenderer object={object} />
					{renderObjectText(object, props)}
				</>
			)
		case 'connector':
			return <ConnectorRenderer object={object} />
		case 'polygon':
			return (
				<>
					<PolygonRenderer object={object} />
					{renderObjectText(object, props)}
				</>
			)
		case 'text': {
			const yText = props.doc ? getObjectYText(props.doc, toObjectId(object.id)) : undefined
			if (props.isEditing && props.onSave) {
				return (
					<TextEditOverlay
						object={object}
						yText={yText}
						onSave={props.onSave}
						caretPoint={props.caretPoint}
						shouldIgnoreBlur={props.shouldIgnoreBlur}
						quillRef={props.quillRef}
						onHeightChange={props.onHeightChange}
					/>
				)
			}
			return <TextLabel object={object} yText={yText} />
		}
		case 'sticky': {
			const yText = props.doc ? getObjectYText(props.doc, toObjectId(object.id)) : undefined
			// When editing, use the overlay instead of the display component
			if (props.isEditing && props.onSave) {
				return (
					<StickyEditOverlay
						object={object}
						yText={yText}
						onSave={props.onSave}
						caretPoint={props.caretPoint}
						shouldIgnoreBlur={props.shouldIgnoreBlur}
						onDragStart={props.onDragStart}
						quillRef={props.quillRef}
						onHeightChange={props.onHeightChange}
					/>
				)
			}
			return <StickyNote object={object} yText={yText} />
		}
		case 'image':
			return (
				<ImageRenderer
					object={object}
					ownerTag={props.ownerTag}
					token={props.token}
					scale={props.scale}
					isHovered={props.isHovered}
					isEraserHovered={props.isEraserHovered}
				/>
			)
		case 'document':
			return (
				<>
					<SvgDocumentEmbed
						x={object.x}
						y={object.y}
						width={object.width}
						height={object.height}
						fileId={object.fileId}
						contentType={object.contentType}
						sourceFileId={props.sourceFileId || ''}
						appId={object.appId}
						access="read"
						navState={object.navState}
						active={props.activeDocument}
						onViewStateChange={
							props.onDocumentViewStateChange
								? (viewState, aspectRatio, aspectFixed) =>
										props.onDocumentViewStateChange!(
											object.id,
											viewState,
											aspectRatio,
											aspectFixed
										)
								: undefined
						}
					/>
					{/*
					 * The border is drawn HERE rather than passed to SvgDocumentEmbed: that
					 * component is shared across apps, and it renders a <foreignObject> with an
					 * iframe, which an SVG clipPath cannot reliably clip across browsers. So the
					 * embedded content's own corners are NOT clipped - the rounded border simply
					 * draws over them, above the iframe. pointerEvents="none" so it never steals a
					 * click from an active document.
					 */}
					{isPaintSet(object.style.strokeColor) && object.style.strokeWidth > 0 && (
						<rect
							x={object.x}
							y={object.y}
							width={object.width}
							height={object.height}
							rx={object.cornerRadius}
							fill="none"
							stroke={colorToCss(object.style.strokeColor)}
							strokeWidth={object.style.strokeWidth}
							pointerEvents="none"
						/>
					)}
				</>
			)
		default:
			return null
	}
}

export function ObjectRenderer({
	object,
	doc,
	ownerTag,
	token,
	scale,
	sourceFileId,
	activeDocument,
	isEditing,
	onSave,
	caretPoint,
	shouldIgnoreBlur,
	onDragStart,
	onDoubleClick,
	quillRef,
	onHeightChange,
	isHighlighted = false,
	isHovered = false,
	isEraserHovered = false,
	isStacked = false,
	onDocumentViewStateChange
}: ObjectRendererProps) {
	const content = renderObject(object, {
		doc,
		ownerTag,
		token,
		scale,
		sourceFileId,
		activeDocument,
		isEditing,
		onSave,
		caretPoint,
		shouldIgnoreBlur,
		onDragStart,
		quillRef,
		onHeightChange,
		isHovered,
		isEraserHovered,
		onDocumentViewStateChange
	})
	if (!content) return null

	// Build class name with optional highlight/hover
	// Images handle hover effects internally to avoid flickering issues with the loading placeholder
	const isImage = object.type === 'image'
	const classNames: string[] = []
	if (isHighlighted) classNames.push('eraser-highlighted')
	if (isHovered && !isImage) classNames.push('object-hovered')
	if (isEraserHovered && !isImage) classNames.push('eraser-hovered')
	if (isStacked) classNames.push('object-stacked')
	const className = classNames.length > 0 ? classNames.join(' ') : undefined

	// Handle double-click for entering edit mode (sticky notes)
	const handleDoubleClick = onDoubleClick
		? (e: React.MouseEvent) => {
				e.stopPropagation()
				onDoubleClick(e)
			}
		: undefined

	// Apply rotation if the object has a non-zero rotation
	if (object.rotation && Math.abs(object.rotation) > 0.1) {
		const [cx, cy] = getRotationCenter(object)
		return (
			<g
				transform={`rotate(${object.rotation} ${cx} ${cy})`}
				className={className}
				onDoubleClick={handleDoubleClick}
			>
				{content}
			</g>
		)
	}

	// Always wrap in group to maintain consistent DOM structure
	// (conditional wrapping causes re-mounts which flicker images)
	return (
		<g className={className} onDoubleClick={handleDoubleClick}>
			{content}
		</g>
	)
}

// vim: ts=4
