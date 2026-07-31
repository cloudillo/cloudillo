// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Floating property bar for the current selection.
 *
 * The bar shows the properties of the thing you selected and nothing else: every group is gated on
 * what the selected types actually have (a text label, a connector and a freehand stroke all have
 * no fill). A mixed selection gets the INTERSECTION of its types' groups, so the bar never offers a
 * control that would be a no-op on half of what is selected.
 *
 * COMPACT, everywhere. No control in the bar carries a visible label: identification is the icon
 * plus title/aria-label, and the labels live in the popovers in PropertyBarPopovers.tsx where there
 * is room for them. Each trigger renders its own state - the Aa button is drawn in the selected
 * font, the align button shows the current alignment's icon - so nothing has to be opened to read.
 */

import { ActionSheet, ActionSheetDivider, ActionSheetItem } from '@cloudillo/react'
import type Quill from 'quill'
import * as React from 'react'
import {
	PiTextBBold as IcBold,
	PiBezierCurveBold as IcCurved,
	PiCopyBold as IcDuplicate,
	PiFlowArrowBold as IcElbow,
	PiTextItalicBold as IcItalic,
	PiListBulletsBold as IcListBullets,
	PiListNumbersBold as IcListNumbers,
	PiLockBold as IcLocked,
	PiDotsThreeBold as IcMore,
	PiLineSegmentBold as IcStraight,
	PiArrowsLeftRightBold as IcSwap,
	PiTrashBold as IcTrash,
	PiLockOpenBold as IcUnlocked
} from 'react-icons/pi'
import type * as Y from 'yjs'

import { reverseConnector } from '../connectors/lifecycle.js'
import type {
	ArrowStyle,
	Bounds,
	ConnectorObject,
	IdealloObject,
	ObjectId,
	ObjectType,
	Routing,
	StoredObject,
	Style,
	TextAlign,
	TextBearingObject,
	VerticalAlign,
	YIdealloDocument
} from '../crdt/index.js'
import {
	DEFAULT_END_ARROW,
	DEFAULT_FONT_FAMILY,
	DEFAULT_START_ARROW,
	DEFAULT_TEXT_ALIGN,
	DEFAULT_VERTICAL_ALIGN,
	deleteObjectsWithBindingCleanup,
	duplicateObject,
	getAllResolvedObjects,
	getObject,
	isTextBearing,
	toggleObjectLock,
	updateObject,
	updateObjectFields
} from '../crdt/index.js'
import type { CurrentStyle } from '../hooks/useIdealloDocument.js'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { usePropertyBarPosition } from '../hooks/usePropertyBarPosition.js'
import { defaultObjectFontSize } from '../utils/object-text.js'
import { canClearFill, canClearStroke, isPaintSet } from '../utils/paint.js'
import { colorToCss } from '../utils/palette.js'
import {
	AlignPopover,
	ArrowheadPopover,
	ArrowheadSwatch,
	CornerRadiusPicker,
	FillPopover,
	OpacitySlider,
	OverflowMenu,
	StrokePopover,
	TEXT_ALIGN_CHOICES,
	TextPopover
} from './PropertyBarPopovers.js'

export interface PropertyBarProps {
	yDoc: Y.Doc
	doc: YIdealloDocument
	/**
	 * Pass objects state to trigger recomputation on changes. `doc` is a stable Yjs reference, so
	 * without this the memos below would never see an edit to the selected objects themselves -
	 * only a change of selection.
	 */
	objects?: Record<string, StoredObject> | null
	selectedIds: Set<ObjectId>
	/** Screen-space bounds of the selection box */
	screenBounds: Bounds | null
	/** Rotation angle of selected object(s) in degrees */
	rotation?: number
	/** Current style for the "default" style when creating new objects */
	currentStyle: CurrentStyle
	/**
	 * Callback to update the current (default) style. Carries the connector and text defaults too,
	 * so the last-used routing, arrowheads, font, size and alignment persist to the next object.
	 */
	onCurrentStyleChange?: (style: Partial<CurrentStyle>) => void
	/** Quill instance ref for inline formatting (available when editing text) */
	quillRef?: React.MutableRefObject<Quill | null>
	/** Whether a text object is currently being edited */
	isTextEditing?: boolean
	/**
	 * Shared, already-resolved objects. app.tsx memoises one resolve pass per document revision;
	 * without it this component would run a second full pass of its own on every edit. Omit it
	 * and the component resolves the document itself.
	 *
	 * A VALUE, not a getter: read during render, and a getter over a commit-time ref (useLatestRef)
	 * hands back the previous revision when an object is created and selected in the same batch,
	 * leaving the bar with an empty selection and no controls but the overflow menu.
	 */
	resolvedObjects?: IdealloObject[]
	/** Deleted objects must not stay selected - the handles would point at air */
	onClearSelection?: () => void
	/** Duplicates become the selection, so the copy is what the next drag moves */
	onSelectObjects?: (ids: ObjectId[]) => void
}

type PopoverType = 'stroke' | 'fill' | 'text' | 'align' | 'arrows' | 'overflow' | null

/** Stable identity for the nothing-selected case, so effects keyed on it stay put */
const EMPTY_OBJECTS: IdealloObject[] = []
const EMPTY_ARROWS: ConnectorObject[] = []

/**
 * Which groups each object type has anything to say about.
 *
 * `stroke` is the outline for a shape and the TEXT COLOUR for a label - TextLabel reads
 * style.strokeColor for its fill - which is why the trigger is titled "Colour" for a
 * text-only selection below.
 *
 * `vAlign` is on for every FIXED BOX - a note and the three shapes - because that is where
 * vertical placement is a real choice. A text label is sized to its own content and has nowhere
 * to sit, so it is the one text-bearing type without it.
 */
interface Caps {
	stroke: boolean
	fill: boolean
	width: boolean
	route: boolean
	ends: boolean
	text: boolean
	vAlign: boolean
	radius: boolean
}

const SHAPE_CAPS: Caps = {
	stroke: true,
	fill: true,
	width: true,
	route: false,
	ends: false,
	text: false,
	vAlign: false,
	radius: false
}

const NO_CAPS: Caps = {
	stroke: false,
	fill: false,
	width: false,
	route: false,
	ends: false,
	text: false,
	vAlign: false,
	radius: false
}

/*
 * Images and documents get an optional BORDER (stroke + width + radius) but no fill: the content
 * covers its own box, so a fill is invisible except while the file is still loading.
 *
 * `radius` is rect-only among the shapes - an ellipse has no corners and a polygon's are its
 * vertices. Sticky is deliberately excluded too: its rx is shared with the DOM borderRadius of the
 * editor overlay, which has to agree with it exactly.
 */
const TYPE_CAPS: Record<ObjectType, Caps> = {
	freehand: { ...SHAPE_CAPS, fill: false },
	rect: { ...SHAPE_CAPS, radius: true, text: true, vAlign: true },
	ellipse: { ...SHAPE_CAPS, text: true, vAlign: true },
	polygon: { ...SHAPE_CAPS, text: true, vAlign: true },
	connector: { ...SHAPE_CAPS, fill: false, route: true, ends: true },
	text: { ...NO_CAPS, stroke: true, text: true },
	sticky: { ...NO_CAPS, fill: true, text: true, vAlign: true },
	image: { ...NO_CAPS, stroke: true, width: true, radius: true },
	document: { ...NO_CAPS, stroke: true, width: true, radius: true }
}

/** Opacity is on every type, so it is not in Caps - it simply always lives in the overflow menu. */

/**
 * The value every item agrees on, or null when they disagree.
 * A mixed selection renders no active state; clicking a value still sets it on all of them.
 */
function commonValue<T, V>(items: T[], read: (item: T) => V): V | null {
	if (!items.length) return null
	const first = read(items[0])
	return items.every((item) => read(item) === first) ? first : null
}

export function PropertyBar({
	yDoc,
	doc,
	objects,
	selectedIds,
	screenBounds,
	rotation = 0,
	currentStyle,
	onCurrentStyleChange,
	quillRef,
	isTextEditing = false,
	resolvedObjects,
	onClearSelection,
	onSelectObjects
}: PropertyBarProps) {
	const isMobile = useIsMobile()

	// Popover state
	const [openPopover, setOpenPopover] = React.useState<PopoverType>(null)
	const popoverRef = React.useRef<HTMLDivElement>(null)

	/*
	 * The button that opened the panel currently on screen. One ref rather than one per group: only
	 * ever one popover is open, and BarPopover only needs somewhere to put focus back on close.
	 * Captured on the click that opens, because the triggers are built inside a group array.
	 */
	const triggerRef = React.useRef<HTMLElement | null>(null)
	const togglePopover = React.useCallback(
		(type: Exclude<PopoverType, null>) => (evt: React.MouseEvent<HTMLElement>) => {
			triggerRef.current = evt.currentTarget
			setOpenPopover((prev) => (prev === type ? null : type))
		},
		[]
	)
	const closePopover = React.useCallback(() => setOpenPopover(null), [])

	/*
	 * One id per panel, so a trigger's `aria-controls` names the panel it opens. Derived from a
	 * useId base rather than a constant: the desktop bar and the mobile sheet can both be mounted,
	 * and duplicate ids would point half the triggers at the wrong panel.
	 */
	const panelIdBase = React.useId()
	const panelId = React.useCallback(
		(type: Exclude<PopoverType, null>) => `${panelIdBase}-${type}`,
		[panelIdBase]
	)

	// ActionSheet state for the mobile "More" overflow
	const [actionsOpen, setActionsOpen] = React.useState(false)

	/*
	 * The bar has to measure itself before it can be placed: it wraps to a second row on a narrow
	 * viewport, and the horizontal clamp needs its width (see utils/property-bar-position.ts).
	 * The root node feeds both this and the outside-click check, so one callback ref fills both.
	 */
	const barRef = React.useRef<HTMLDivElement | null>(null)
	const setBarNode = React.useCallback((node: HTMLDivElement | null) => {
		barRef.current = node
		popoverRef.current = node
	}, [])
	const { position, measured } = usePropertyBarPosition(barRef, screenBounds, rotation)

	// Prevent mousedown on formatting buttons from stealing focus from Quill editor
	const preventBlur = React.useCallback((e: React.MouseEvent) => {
		e.preventDefault()
	}, [])

	// Inline formatting handlers
	const handleInlineBold = React.useCallback(() => {
		const quill = quillRef?.current
		if (!quill) return
		const format = quill.getFormat()
		quill.format('bold', !format.bold)
	}, [quillRef])

	const handleInlineItalic = React.useCallback(() => {
		const quill = quillRef?.current
		if (!quill) return
		const format = quill.getFormat()
		quill.format('italic', !format.italic)
	}, [quillRef])

	const handleListBullet = React.useCallback(() => {
		const quill = quillRef?.current
		if (!quill) return
		const format = quill.getFormat()
		quill.format('list', format.list === 'bullet' ? false : 'bullet')
	}, [quillRef])

	const handleListOrdered = React.useCallback(() => {
		const quill = quillRef?.current
		if (!quill) return
		const format = quill.getFormat()
		quill.format('list', format.list === 'ordered' ? false : 'ordered')
	}, [quillRef])

	// Track Quill selection format for button active state
	const [selectionFormat, setSelectionFormat] = React.useState<Record<string, unknown>>({})
	React.useEffect(() => {
		const quill = quillRef?.current
		if (!quill || !isTextEditing) {
			setSelectionFormat({})
			return
		}
		const onSelectionChange = () => {
			setSelectionFormat(quill.getFormat() || {})
		}
		quill.on('selection-change', onSelectionChange)
		quill.on('text-change', onSelectionChange)
		onSelectionChange()
		return () => {
			quill.off('selection-change', onSelectionChange)
			quill.off('text-change', onSelectionChange)
		}
	}, [quillRef, isTextEditing])

	// Close popover when selection changes
	React.useEffect(() => {
		setOpenPopover(null)
	}, [selectedIds])

	// Close popover on outside click
	React.useEffect(() => {
		if (!openPopover) return

		const handleClickOutside = (e: PointerEvent) => {
			const target = e.target as HTMLElement | null
			// FontPicker portals its menu to #popper-container, so a click on a font name is
			// outside the bar in the DOM while being very much inside it for the user. Closing
			// here would unmount the picker before its click fires and the font would never change.
			if (target?.closest?.('.c-font-picker__menu')) return
			if (popoverRef.current && !popoverRef.current.contains(target)) {
				// The dismissing click is SWALLOWED, or it also reaches the canvas underneath and
				// changes the selection on the way past.
				e.stopPropagation()
				e.preventDefault()
				setOpenPopover(null)
			}
		}

		/*
		 * `pointerdown`, not `mousedown`: SvgCanvas starts its gesture on pointerdown, which fires
		 * FIRST, so swallowing the mousedown left the canvas gesture already under way. Same event
		 * as ToolPopover's outside-click, which is what keeps the two panels behaving alike.
		 *
		 * Capture phase, and it has to be: React 19 attaches its listeners at the root container,
		 * which is a DESCENDANT of `document`, so a bubble-phase listener here runs after React has
		 * already dispatched the event and can no longer retract it.
		 */
		document.addEventListener('pointerdown', handleClickOutside, true)
		return () => document.removeEventListener('pointerdown', handleClickOutside, true)
	}, [openPopover])

	// Get style from first selected object
	const getSelectedStyle = React.useCallback((): Style | null => {
		if (selectedIds.size === 0) return null
		const firstId = Array.from(selectedIds)[0]
		const obj = getObject(doc, firstId)
		return obj?.style ?? null
	}, [doc, objects, selectedIds])

	/**
	 * The selection, resolved.
	 *
	 * Sourced from RESOLVED objects because a bound connector's stored startX/startY is the
	 * bind-time snapshot, not where the arrow is now.
	 */
	const selectedObjects = React.useMemo(() => {
		// Nothing selected: skip the pass entirely rather than resolve the document to find out
		if (!selectedIds.size) return EMPTY_OBJECTS
		const out: IdealloObject[] = []
		for (const obj of resolvedObjects ?? getAllResolvedObjects(doc)) {
			if (selectedIds.has(obj.id)) out.push(obj)
		}
		return out.length ? out : EMPTY_OBJECTS
	}, [doc, objects, selectedIds, resolvedObjects])

	const selectedArrows = React.useMemo(() => {
		const out = selectedObjects.filter(
			(obj): obj is ConnectorObject => obj.type === 'connector'
		)
		return out.length ? out : EMPTY_ARROWS
	}, [selectedObjects])

	const textObjects = React.useMemo(
		() => selectedObjects.filter((obj): obj is TextBearingObject => isTextBearing(obj.type)),
		[selectedObjects]
	)

	/** The intersection of what the selected types can be told about */
	const caps = React.useMemo<Caps>(() => {
		if (!selectedObjects.length) return NO_CAPS
		return selectedObjects.reduce<Caps>((acc, obj) => {
			const own = TYPE_CAPS[obj.type]
			return {
				stroke: acc.stroke && own.stroke,
				fill: acc.fill && own.fill,
				width: acc.width && own.width,
				route: acc.route && own.route,
				ends: acc.ends && own.ends,
				text: acc.text && own.text,
				vAlign: acc.vAlign && own.vAlign,
				radius: acc.radius && own.radius
			}
		}, TYPE_CAPS[selectedObjects[0].type])
	}, [selectedObjects])

	/**
	 * "Stroke" is a lie for a text label: TextLabel renders its glyphs in style.strokeColor, so for
	 * a text-only selection the swatch is the text colour and the trigger's title says so.
	 */
	const strokeLabel = selectedObjects.every((obj) => obj.type === 'text') ? 'Colour' : 'Stroke'

	// Local style state - updated immediately on change, synced from selection
	const [localStyle, setLocalStyle] = React.useState(() => {
		const style = getSelectedStyle()
		if (style) {
			return {
				strokeColor: style.strokeColor,
				fillColor: style.fillColor,
				strokeWidth: style.strokeWidth,
				opacity: style.opacity ?? 1
			}
		}
		return { ...currentStyle, opacity: 1 }
	})

	// Sync local style when selection changes
	React.useEffect(() => {
		const style = getSelectedStyle()
		if (style) {
			setLocalStyle({
				strokeColor: style.strokeColor,
				fillColor: style.fillColor,
				strokeWidth: style.strokeWidth,
				opacity: style.opacity ?? 1
			})
		} else {
			setLocalStyle({ ...currentStyle, opacity: 1 })
		}
	}, [selectedIds, getSelectedStyle, currentStyle])

	// Use local style for display
	const displayStyle = localStyle

	// Has a fill / a stroke (not transparent/none)
	const hasFill = isPaintSet(displayStyle.fillColor)
	const hasStroke = isPaintSet(displayStyle.strokeColor)

	/*
	 * Whether the "None" swatch may be offered at all.
	 *
	 * `every`, not `some`: updateSelectedStyle is one funnel over a possibly-mixed selection, so a
	 * partial application would silently no-op on half of it - worse than a disabled control.
	 */
	const allowClearStroke = selectedObjects.every(canClearStroke)
	const allowClearFill = selectedObjects.every(canClearFill)

	/** An absent radius IS zero, so a mixed selection still lands on a real preset */
	const displayCornerRadius =
		commonValue(selectedObjects, (obj) =>
			'cornerRadius' in obj ? (obj.cornerRadius ?? 0) : 0
		) ?? 0

	// Update all selected objects
	const updateSelectedStyle = React.useCallback(
		(updates: Partial<Style>) => {
			// Update local style immediately for responsive UI
			setLocalStyle((prev) => ({ ...prev, ...updates }))

			// One transaction for the whole selection, so N objects still cost one undo
			yDoc.transact(() => {
				selectedIds.forEach((id) => {
					const obj = getObject(doc, id)
					if (obj) {
						updateObject(yDoc, doc, id, {
							style: { ...obj.style, ...updates }
						} as Partial<IdealloObject>)
					}
				})
			}, yDoc.clientID)
			// Also update current style for new objects
			onCurrentStyleChange?.(updates)
		},
		[yDoc, doc, selectedIds, onCurrentStyleChange]
	)

	/**
	 * Sibling of updateSelectedStyle for the connector fields (routing, arrowheads).
	 * Pushes back into currentStyle the same way, so the last-used settings persist to the
	 * next arrow drawn.
	 */
	const updateSelectedArrowFields = React.useCallback(
		(updates: { routing?: Routing; startArrow?: ArrowStyle; endArrow?: ArrowStyle }) => {
			// One transaction for the whole selection, so N connectors still cost one undo
			yDoc.transact(() => {
				selectedIds.forEach((id) => {
					updateObjectFields(yDoc, doc, id, updates)
				})
			}, yDoc.clientID)
			onCurrentStyleChange?.(updates)
		},
		[yDoc, doc, selectedIds, onCurrentStyleChange]
	)

	// Local mirror of the connector props, so a click reads back instantly rather than waiting
	// for the CRDT round trip - same reason localStyle exists.
	const [localArrowProps, setLocalArrowProps] = React.useState<{
		routing: Routing
		startArrow: ArrowStyle
		endArrow: ArrowStyle
	} | null>(null)

	// Re-sync only when the selection or the connector props THEMSELVES change. selectedArrows is
	// a fresh array on every document revision, so keying the effect on it would refire on any
	// unrelated edit and overwrite the click the local mirror exists to make instant.
	const arrowPropsKey = selectedArrows.length
		? `${selectedArrows[0].id}|${selectedArrows[0].routing}|` +
			`${JSON.stringify(selectedArrows[0].startArrow)}|` +
			`${JSON.stringify(selectedArrows[0].endArrow)}`
		: ''

	React.useEffect(() => {
		const first = selectedArrows[0]
		setLocalArrowProps(
			first
				? { routing: first.routing, startArrow: first.startArrow, endArrow: first.endArrow }
				: null
		)
		// arrowPropsKey is the real dependency; selectedArrows is read through it
	}, [arrowPropsKey])

	/** Mixed selections render nothing active; clicking a value sets it on every arrow. */
	const mixedRouting = selectedArrows.some((a) => a.routing !== selectedArrows[0]?.routing)
	const displayRouting = mixedRouting ? null : (localArrowProps?.routing ?? null)
	const displayStartArrow = localArrowProps?.startArrow ?? DEFAULT_START_ARROW
	const displayEndArrow = localArrowProps?.endArrow ?? DEFAULT_END_ARROW

	const handleRoutingChange = React.useCallback(
		(routing: Routing) => {
			setLocalArrowProps((prev) => (prev ? { ...prev, routing } : prev))
			updateSelectedArrowFields({ routing })
		},
		[updateSelectedArrowFields]
	)

	const handleArrowheadChange = React.useCallback(
		(terminal: 'start' | 'end', style: ArrowStyle) => {
			setLocalArrowProps((prev) =>
				prev ? { ...prev, [terminal === 'start' ? 'startArrow' : 'endArrow']: style } : prev
			)
			updateSelectedArrowFields(
				terminal === 'start' ? { startArrow: style } : { endArrow: style }
			)
		},
		[updateSelectedArrowFields]
	)

	// Text style: font, size, alignment

	const textValues = React.useMemo(() => {
		if (!textObjects.length) return null
		return {
			fontFamily: commonValue(textObjects, (o) => o.fontFamily ?? DEFAULT_FONT_FAMILY),
			fontSize: commonValue(textObjects, (o) => o.fontSize ?? defaultObjectFontSize(o.type)),
			textAlign: commonValue(textObjects, (o) => o.textAlign ?? DEFAULT_TEXT_ALIGN),
			verticalAlign: commonValue(
				textObjects,
				(o) => o.verticalAlign ?? DEFAULT_VERTICAL_ALIGN
			)
		}
	}, [textObjects])

	// Local mirror, keyed the same way as the connector one and for the same reason
	const [localTextValues, setLocalTextValues] = React.useState(textValues)

	const textValuesKey = textValues
		? `${textValues.fontFamily}|${textValues.fontSize}|` +
			`${textValues.textAlign}|${textValues.verticalAlign}`
		: ''

	React.useEffect(() => {
		setLocalTextValues(textValues)
		// textValuesKey is the real dependency; textValues is read through it
	}, [textValuesKey])

	const displayText = localTextValues ?? textValues

	const updateSelectedTextStyle = React.useCallback(
		(updates: {
			fontFamily?: string
			fontSize?: number
			textAlign?: TextAlign
			verticalAlign?: VerticalAlign
		}) => {
			setLocalTextValues((prev) => (prev ? { ...prev, ...updates } : prev))
			// One transaction, so restyling N labels is one undo
			yDoc.transact(() => {
				selectedIds.forEach((id) => {
					const obj = getObject(doc, id)
					if (!obj || !isTextBearing(obj.type)) return
					updateObjectFields(yDoc, doc, id, updates)
				})
			}, yDoc.clientID)
			// Last-used settings carry to the next text object created
			onCurrentStyleChange?.(updates)
		},
		[yDoc, doc, selectedIds, onCurrentStyleChange]
	)

	const handleFontFamilyChange = React.useCallback(
		(fontFamily: string) => updateSelectedTextStyle({ fontFamily }),
		[updateSelectedTextStyle]
	)

	const handleFontSizeChange = React.useCallback(
		(fontSize: number) => updateSelectedTextStyle({ fontSize }),
		[updateSelectedTextStyle]
	)

	const handleTextAlignChange = React.useCallback(
		(textAlign: TextAlign) => updateSelectedTextStyle({ textAlign }),
		[updateSelectedTextStyle]
	)

	const handleVerticalAlignChange = React.useCallback(
		(verticalAlign: VerticalAlign) => updateSelectedTextStyle({ verticalAlign }),
		[updateSelectedTextStyle]
	)

	/** Mixed lock states resolve towards locking: one click makes the whole selection consistent */
	const anyUnlocked = selectedObjects.some((obj) => !obj.locked)

	/** A lock protects against deletion too, so an all-locked selection has nothing to delete */
	const canDelete = anyUnlocked

	const handleToggleLock = React.useCallback(() => {
		const lock = anyUnlocked
		yDoc.transact(() => {
			selectedIds.forEach((id) => {
				const obj = getObject(doc, id)
				if (!obj || obj.locked === lock) return
				toggleObjectLock(yDoc, doc, id)
			})
		}, yDoc.clientID)
	}, [yDoc, doc, selectedIds, anyUnlocked])

	const handleDuplicate = React.useCallback(() => {
		const created: ObjectId[] = []
		// One transaction, so a multi-object duplicate is one undo
		yDoc.transact(() => {
			selectedIds.forEach((id) => {
				// A TRUE copy, not duplicateAsLinkedCopy: a user pressing Duplicate expects an
				// independent object, not one whose text edits echo back into the original.
				const newId = duplicateObject(yDoc, doc, id)
				if (newId) created.push(newId)
			})
		}, yDoc.clientID)
		if (created.length) onSelectObjects?.(created)
	}, [yDoc, doc, selectedIds, onSelectObjects])

	/**
	 * Flip the selected connectors. Locked members are skipped, the same rule `canDelete` keeps, and
	 * both entry points are disabled on `anyUnlocked`. A STORED-record edit, so the local arrow-prop
	 * mirror needs no touching: routing and the two arrowheads are what it does not move.
	 */
	const handleReverseConnectors = React.useCallback(() => {
		// One transaction, so reversing N connectors is one undo
		yDoc.transact(() => {
			selectedArrows.forEach((arrow) => {
				if (arrow.locked) return
				reverseConnector(yDoc, doc, arrow.id)
			})
		}, yDoc.clientID)
	}, [yDoc, doc, selectedArrows])

	const handleDelete = React.useCallback(() => {
		// NEVER deleteObject: anything removing objects has to freeze the connectors bound to them
		// first, or an arrow attached to the deleted shape is destroyed with it. Locked members are
		// skipped by the CRDT layer, so keep the selection when nothing can go.
		deleteObjectsWithBindingCleanup(yDoc, doc, Array.from(selectedIds))
		if (canDelete) onClearSelection?.()
	}, [yDoc, doc, selectedIds, onClearSelection, canDelete])

	/*
	 * Picking a colour does NOT close the panel: stroke and fill are property panels, dismissed by
	 * Escape / Tab / an outside click / a change of selection. Closing here also raced ColorPalette's
	 * hex field, which submits on blur - the panel went before a following width click could land.
	 */
	const handleStrokeColorChange = React.useCallback(
		(color: string) => {
			updateSelectedStyle({ strokeColor: color })
		},
		[updateSelectedStyle]
	)

	const handleFillColorChange = React.useCallback(
		(color: string) => {
			updateSelectedStyle({ fillColor: color })
		},
		[updateSelectedStyle]
	)

	// Handle stroke width change
	const handleStrokeWidthChange = React.useCallback(
		(width: number) => {
			updateSelectedStyle({ strokeWidth: width })
		},
		[updateSelectedStyle]
	)

	// Handle opacity change
	const handleOpacityChange = React.useCallback(
		(opacity: number) => {
			updateSelectedStyle({ opacity })
		},
		[updateSelectedStyle]
	)

	/*
	 * The radius is an OBJECT field, not a style one, so it takes the updateSelectedArrowFields
	 * route rather than updateSelectedStyle. No per-object type guard either: `caps.radius` has
	 * already established that every selected object accepts one.
	 *
	 * Not pushed into currentStyle - a radius is per-shape, unlike a routing default.
	 */
	const handleCornerRadiusChange = React.useCallback(
		(cornerRadius: number) => {
			yDoc.transact(() => {
				selectedIds.forEach((id) => {
					updateObjectFields(yDoc, doc, id, { cornerRadius })
				})
			}, yDoc.clientID)
		},
		[yDoc, doc, selectedIds]
	)

	// Don't render if nothing selected
	if (selectedIds.size === 0 || !position) return null

	/** The alignment trigger wears the current alignment. A mixed selection falls back to left. */
	const AlignTriggerIcon =
		TEXT_ALIGN_CHOICES.find((c) => c.value === displayText?.textAlign)?.Icon ??
		TEXT_ALIGN_CHOICES[0].Icon

	/*
	 * Groups are collected rather than written inline so the dividers can be interleaved: with
	 * every group conditional, inline dividers would strand a leading or trailing one whenever
	 * the neighbour it separates is absent.
	 */
	const groups: { key: string; node: React.ReactNode }[] = []

	if (isTextEditing && quillRef) {
		groups.push({
			key: 'inline',
			node: (
				<div className="ideallo-property-group">
					<button
						type="button"
						className={`ideallo-format-btn${selectionFormat.bold ? ' active' : ''}`}
						onMouseDown={preventBlur}
						onClick={handleInlineBold}
						title="Bold (Ctrl+B)"
						aria-label="Bold"
						aria-pressed={Boolean(selectionFormat.bold)}
					>
						<IcBold size={14} />
					</button>
					<button
						type="button"
						className={`ideallo-format-btn${selectionFormat.italic ? ' active' : ''}`}
						onMouseDown={preventBlur}
						onClick={handleInlineItalic}
						title="Italic (Ctrl+I)"
						aria-label="Italic"
						aria-pressed={Boolean(selectionFormat.italic)}
					>
						<IcItalic size={14} />
					</button>
					<button
						type="button"
						className={`ideallo-format-btn${selectionFormat.list === 'bullet' ? ' active' : ''}`}
						onMouseDown={preventBlur}
						onClick={handleListBullet}
						title="Bullet list"
						aria-label="Bullet list"
						aria-pressed={selectionFormat.list === 'bullet'}
					>
						<IcListBullets size={14} />
					</button>
					<button
						type="button"
						className={`ideallo-format-btn${selectionFormat.list === 'ordered' ? ' active' : ''}`}
						onMouseDown={preventBlur}
						onClick={handleListOrdered}
						title="Numbered list"
						aria-label="Numbered list"
						aria-pressed={selectionFormat.list === 'ordered'}
					>
						<IcListNumbers size={14} />
					</button>
				</div>
			)
		})
	}

	if (caps.stroke) {
		groups.push({
			key: 'stroke',
			node: (
				<div className="ideallo-property-group">
					<div className="ideallo-color-picker">
						{/* An OUTLINE, not a fill: otherwise it is indistinguishable from the
						    fill trigger right next to it */}
						<button
							type="button"
							className={`palette-swatch-btn stroke${!hasStroke ? ' transparent' : ''}`}
							style={
								{
									'--swatch-color': colorToCss(displayStyle.strokeColor)
								} as React.CSSProperties
							}
							onClick={togglePopover('stroke')}
							title={strokeLabel}
							aria-label={strokeLabel}
							aria-haspopup="true"
							aria-controls={panelId('stroke')}
							aria-expanded={openPopover === 'stroke'}
						>
							{!hasStroke && <span className="swatch-none">⊘</span>}
						</button>
						{openPopover === 'stroke' && (
							<StrokePopover
								value={displayStyle.strokeColor}
								onChange={handleStrokeColorChange}
								// Stroke width lives in the stroke popover, not an inline group
								width={caps.width ? displayStyle.strokeWidth : undefined}
								onWidthChange={caps.width ? handleStrokeWidthChange : undefined}
								disableTransparent={!allowClearStroke}
								label={strokeLabel}
								panelId={panelId('stroke')}
								onClose={closePopover}
								anchorRef={triggerRef}
							/>
						)}
					</div>
				</div>
			)
		})
	}

	if (caps.fill) {
		groups.push({
			key: 'fill',
			node: (
				<div className="ideallo-property-group">
					<div className="ideallo-color-picker">
						<button
							type="button"
							className={`palette-swatch-btn ${!hasFill ? 'transparent' : ''}`}
							style={
								hasFill
									? { backgroundColor: colorToCss(displayStyle.fillColor) }
									: undefined
							}
							onClick={togglePopover('fill')}
							title="Fill"
							aria-label="Fill"
							aria-haspopup="true"
							aria-controls={panelId('fill')}
							aria-expanded={openPopover === 'fill'}
						>
							{!hasFill && <span className="swatch-none">⊘</span>}
						</button>
						{openPopover === 'fill' && (
							<FillPopover
								value={displayStyle.fillColor}
								onChange={handleFillColorChange}
								disableTransparent={!allowClearFill}
								label="Fill"
								panelId={panelId('fill')}
								onClose={closePopover}
								anchorRef={triggerRef}
							/>
						)}
					</div>
				</div>
			)
		})
	}

	if (caps.text && displayText) {
		groups.push({
			key: 'text',
			node: (
				<div className="ideallo-property-group">
					<div className="ideallo-color-picker">
						{/* The trigger is drawn IN the chosen family, so the bar previews it */}
						<button
							type="button"
							className={`ideallo-format-btn ideallo-font-trigger${openPopover === 'text' ? ' active' : ''}`}
							style={{ fontFamily: displayText.fontFamily ?? undefined }}
							onMouseDown={preventBlur}
							onClick={togglePopover('text')}
							title="Font and size"
							aria-label="Font and size"
							aria-haspopup="true"
							aria-controls={panelId('text')}
							aria-expanded={openPopover === 'text'}
						>
							Aa
						</button>
						{openPopover === 'text' && (
							<TextPopover
								fontFamily={displayText.fontFamily}
								fontSize={displayText.fontSize}
								onFontFamilyChange={handleFontFamilyChange}
								onFontSizeChange={handleFontSizeChange}
								label="Font and size"
								panelId={panelId('text')}
								onClose={closePopover}
								anchorRef={triggerRef}
								// Taking focus would blur the Quill editor being formatted, which is
								// what the preventBlur handlers exist to stop
								manageFocus={!isTextEditing}
							/>
						)}
					</div>
				</div>
			)
		})

		groups.push({
			key: 'align',
			node: (
				<div className="ideallo-property-group">
					<div className="ideallo-color-picker">
						<button
							type="button"
							className={`ideallo-format-btn${openPopover === 'align' ? ' active' : ''}`}
							onMouseDown={preventBlur}
							onClick={togglePopover('align')}
							title="Alignment"
							aria-label="Alignment"
							aria-haspopup="true"
							aria-controls={panelId('align')}
							aria-expanded={openPopover === 'align'}
						>
							<AlignTriggerIcon size={14} />
						</button>
						{openPopover === 'align' && (
							<AlignPopover
								textAlign={displayText.textAlign}
								verticalAlign={displayText.verticalAlign}
								showVAlign={caps.vAlign}
								onTextAlignChange={handleTextAlignChange}
								onVerticalAlignChange={handleVerticalAlignChange}
								preventBlur={preventBlur}
								label="Alignment"
								panelId={panelId('align')}
								onClose={closePopover}
								anchorRef={triggerRef}
								// Same reason as TextPopover above
								manageFocus={!isTextEditing}
							/>
						)}
					</div>
				</div>
			)
		})
	}

	if (caps.route) {
		// Three states, three icons: the only inline multi-button group left, because routing is
		// the one connector property that gets changed repeatedly while shaping a diagram
		groups.push({
			key: 'route',
			node: (
				<div className="ideallo-property-group">
					{(
						[
							['straight', 'Straight', IcStraight],
							['curved', 'Curved', IcCurved],
							['orthogonal', 'Elbow', IcElbow]
						] as const
					).map(([value, title, Icon]) => (
						<button
							key={value}
							type="button"
							className={`ideallo-format-btn${displayRouting === value ? ' active' : ''}`}
							onClick={() => handleRoutingChange(value)}
							title={title}
							aria-label={title}
							aria-pressed={displayRouting === value}
						>
							<Icon size={14} />
						</button>
					))}
				</div>
			)
		})
	}

	if (caps.ends) {
		groups.push({
			key: 'ends',
			node: (
				<div className="ideallo-property-group">
					<div className="ideallo-color-picker">
						<button
							type="button"
							className="ideallo-arrowhead-swatch-btn"
							onClick={togglePopover('arrows')}
							title="Arrowheads"
							aria-label="Arrowheads"
							aria-haspopup="true"
							aria-controls={panelId('arrows')}
							aria-expanded={openPopover === 'arrows'}
						>
							<span className="flip">
								<ArrowheadSwatch type={displayStartArrow.type} size={20} />
							</span>
							<ArrowheadSwatch type={displayEndArrow.type} size={20} />
						</button>
						{openPopover === 'arrows' && (
							<ArrowheadPopover
								start={displayStartArrow}
								end={displayEndArrow}
								onChange={handleArrowheadChange}
								label="Arrowheads"
								panelId={panelId('arrows')}
								onClose={closePopover}
								anchorRef={triggerRef}
							/>
						)}
					</div>
				</div>
			)
		})
	}

	/*
	 * The overflow. Always present, and the same set on every type: opacity, then lock, duplicate
	 * and delete. Desktop opens an in-bar menu, mobile the ActionSheet the toolbar already uses.
	 */
	groups.push({
		key: 'overflow',
		node: (
			<div className="ideallo-property-group">
				<div className="ideallo-color-picker">
					<button
						type="button"
						className={`ideallo-format-btn${(isMobile ? actionsOpen : openPopover === 'overflow') ? ' active' : ''}`}
						onClick={(evt) =>
							isMobile ? setActionsOpen(true) : togglePopover('overflow')(evt)
						}
						title="More"
						aria-label="More"
						// Mobile opens an ActionSheet, which is a role="dialog" aria-modal overlay:
						// that is announced by aria-haspopup="dialog", and aria-expanded is not a
						// property of a dialog trigger at all.
						aria-haspopup={isMobile ? 'dialog' : 'true'}
						aria-controls={isMobile ? undefined : panelId('overflow')}
						aria-expanded={isMobile ? undefined : openPopover === 'overflow'}
					>
						<IcMore size={16} />
					</button>
					{!isMobile && openPopover === 'overflow' && (
						<OverflowMenu
							opacity={displayStyle.opacity}
							onOpacityChange={handleOpacityChange}
							cornerRadius={caps.radius ? displayCornerRadius : undefined}
							onCornerRadiusChange={
								caps.radius ? handleCornerRadiusChange : undefined
							}
							anyUnlocked={anyUnlocked}
							onToggleLock={handleToggleLock}
							// `caps.ends` is the intersection, so it is on exactly when every
							// selected object is a connector
							onReverse={caps.ends ? handleReverseConnectors : undefined}
							onDuplicate={handleDuplicate}
							canDelete={canDelete}
							onDelete={handleDelete}
							label="More"
							panelId={panelId('overflow')}
							onClose={closePopover}
							anchorRef={triggerRef}
						/>
					)}
				</div>
			</div>
		)
	})

	return (
		<div
			className="ideallo-property-bar"
			ref={setBarNode}
			style={{
				// Parked at the origin while unmeasured: the bar is `width: max-content`, so on
				// its first frame it is laid out at full natural width from a `left` that may be
				// near the right edge, and a hidden box still contributes scrollable overflow.
				// With translateX(-50%) at left 0 it hangs off the LEFT edge, which in LTR is not
				// scrollable, so no document scrollbar flashes.
				top: measured ? position.top : 0,
				left: measured ? position.left : 0,
				transform: 'translateX(-50%)',
				// The first frame has no measured width, so the clamp is still a no-op there.
				// Hide it rather than let the user watch it snap into place.
				visibility: measured ? undefined : 'hidden'
			}}
		>
			{groups.map((group, i) => (
				<React.Fragment key={group.key}>
					{i > 0 && <div className="ideallo-property-divider" />}
					{group.node}
				</React.Fragment>
			))}

			{isMobile && (
				<ActionSheet
					isOpen={actionsOpen}
					onClose={() => setActionsOpen(false)}
					title="Actions"
				>
					{/* Opacity has no inline slot any more, so the sheet is its mobile home too */}
					<div className="ideallo-action-sheet-row">
						<OpacitySlider
							value={displayStyle.opacity}
							onChange={handleOpacityChange}
						/>
					</div>
					{caps.radius && (
						<div className="ideallo-action-sheet-row">
							<CornerRadiusPicker
								value={displayCornerRadius}
								onChange={handleCornerRadiusChange}
							/>
						</div>
					)}
					{/* No checked variant on ActionSheetItem, so the state rides in the label */}
					<ActionSheetItem
						icon={anyUnlocked ? <IcUnlocked size={20} /> : <IcLocked size={20} />}
						label={anyUnlocked ? 'Lock' : 'Unlock'}
						aria-pressed={!anyUnlocked}
						onClick={() => {
							handleToggleLock()
							setActionsOpen(false)
						}}
					/>
					{caps.ends && (
						<ActionSheetItem
							icon={<IcSwap size={20} />}
							label="Reverse direction"
							disabled={!anyUnlocked}
							onClick={() => {
								handleReverseConnectors()
								setActionsOpen(false)
							}}
						/>
					)}
					<ActionSheetItem
						icon={<IcDuplicate size={20} />}
						label="Duplicate"
						onClick={() => {
							handleDuplicate()
							setActionsOpen(false)
						}}
					/>
					<ActionSheetDivider />
					<ActionSheetItem
						icon={<IcTrash size={20} />}
						label="Delete"
						disabled={!canDelete}
						onClick={() => {
							handleDelete()
							setActionsOpen(false)
						}}
					/>
				</ActionSheet>
			)}
		</div>
	)
}

// vim: ts=4
