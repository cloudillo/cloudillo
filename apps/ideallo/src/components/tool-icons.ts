// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The icon half of the tool catalog, kept apart from `tools/catalog.ts` so that module stays
 * React-free for the tool tests.
 *
 * Icons are stored as COMPONENT REFERENCES, not instantiated elements: the same icon is drawn at
 * 24 (desktop bar), 22 (popover) and 20 (action sheet), and an element with a baked-in `size`
 * cannot be reused at another size.
 */

import type { IconType } from 'react-icons'
import {
	PiArrowUpBold as IcBringForward,
	PiArrowLineUpBold as IcBringToFront,
	PiDiamondBold as IcDiamond,
	PiFileBold as IcDocument,
	PiCircleBold as IcEllipse,
	PiEraserBold as IcEraser,
	PiImageBold as IcImage,
	PiLineSegmentBold as IcLine,
	PiPencilSimpleBold as IcPen,
	PiRectangleBold as IcRect,
	PiCursorBold as IcSelect,
	PiArrowDownBold as IcSendBackward,
	PiArrowLineDownBold as IcSendToBack,
	PiNoteBold as IcSticky,
	PiTextTBold as IcText,
	PiTriangleBold as IcTriangle
} from 'react-icons/pi'

import type { ToolType } from '../tools/index.js'

/** Exhaustive: a new ToolType with no icon is a compile error. */
export const TOOL_ICONS: Record<ToolType, IconType> = {
	select: IcSelect,
	pen: IcPen,
	eraser: IcEraser,
	rect: IcRect,
	ellipse: IcEllipse,
	diamond: IcDiamond,
	triangle: IcTriangle,
	connector: IcLine,
	text: IcText,
	sticky: IcSticky,
	image: IcImage,
	document: IcDocument
}

export type LayerActionId = 'front' | 'forward' | 'backward' | 'back'

export interface LayerAction {
	id: LayerActionId
	label: string
	shortcut: string
	Icon: IconType
}

/**
 * The z-order actions.
 *
 * Deliberately NOT members of ToolType: adding them there would break the `Record<ToolType, ...>`
 * exhaustiveness tripwire that the catalog and the icon table rely on.
 */
export const LAYER_ACTIONS: LayerAction[] = [
	{ id: 'front', label: 'Bring to Front', shortcut: 'Ctrl+Shift+]', Icon: IcBringToFront },
	{ id: 'forward', label: 'Bring Forward', shortcut: 'Ctrl+]', Icon: IcBringForward },
	{ id: 'backward', label: 'Send Backward', shortcut: 'Ctrl+[', Icon: IcSendBackward },
	{ id: 'back', label: 'Send to Back', shortcut: 'Ctrl+Shift+[', Icon: IcSendToBack }
]

// vim: ts=4
