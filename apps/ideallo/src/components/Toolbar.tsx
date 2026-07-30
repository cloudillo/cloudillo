// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Floating toolbar for Ideallo
 * Contains tool selection, undo/redo, and other controls.
 * On mobile (<=767px) renders a compact dock with grouped tool popovers.
 *
 * Every icon, label and shortcut comes from `tools/catalog.ts` and `tool-icons.ts`, so the two
 * layouts below describe only their arrangement - they cannot disagree about what a tool is
 * called or which key arms it.
 */

import { ActionSheet, ActionSheetDivider, ActionSheetItem } from '@cloudillo/react'
import * as React from 'react'
import {
	PiExportBold as IcExport,
	PiLockBold as IcLocked,
	PiDotsThreeBold as IcMore,
	PiPushPinBold as IcPin,
	PiArrowArcRightBold as IcRedo,
	PiStackBold as IcStack,
	PiToolboxBold as IcToolbox,
	PiArrowArcLeftBold as IcUndo,
	PiLockOpenBold as IcUnlocked
} from 'react-icons/pi'

import { useIsMobile } from '../hooks/useIsMobile.js'
import type { ToolCategory, ToolType } from '../tools/index.js'
import { CATEGORY_LABELS, CATEGORY_ORDER, TOOL_CATALOG, TOOLS_BY_CATEGORY } from '../tools/index.js'
import { ToolPopover, type ToolPopoverSection } from './ToolPopover.js'
import { LAYER_ACTIONS, type LayerActionId, TOOL_ICONS } from './tool-icons.js'

export interface ToolbarProps {
	activeTool: ToolType
	canUndo: boolean
	canRedo: boolean
	hasSelection: boolean
	/** Keep the active tool armed after a placement instead of reverting to Select */
	toolLocked: boolean
	/**
	 * Bind connector terminals to a free point rather than the nearest anchor - mobile parity for
	 * the Alt modifier.
	 *
	 * A global canvas mode, so it lives here beside the tool lock rather than in the property bar:
	 * it has to be armable BEFORE the arrow is drawn, i.e. with nothing selected.
	 */
	preciseMode: boolean
	onToolChange: (tool: ToolType) => void
	onToolLockChange: (locked: boolean) => void
	onPreciseModeChange: (enabled: boolean) => void
	onUndo: () => void
	onRedo: () => void
	onExport: () => void
	onBringToFront: () => void
	onBringForward: () => void
	onSendBackward: () => void
	onSendToBack: () => void
}

interface ToolButtonProps {
	tool: ToolType
	activeTool: ToolType
	size: number
	onToolChange: (tool: ToolType) => void
}

/** The one tool button, used by both layouts and by the popovers' triggers. */
function ToolButton({ tool, activeTool, size, onToolChange }: ToolButtonProps) {
	const descriptor = TOOL_CATALOG[tool]
	const Icon = TOOL_ICONS[tool]
	return (
		<button
			type="button"
			className={`ideallo-tool-btn${activeTool === tool ? ' active' : ''}`}
			aria-pressed={activeTool === tool}
			onClick={() => onToolChange(tool)}
			title={`${descriptor.label} (${descriptor.shortcut})`}
			aria-label={descriptor.label}
		>
			<Icon size={size} />
		</button>
	)
}

/** Which popover, if any, is open. A single value is what keeps them mutually exclusive. */
type OpenMenu = 'draw' | 'shapes' | 'layer' | 'tools' | null

/**
 * Which member of each category a group trigger shows, seeded from the catalog's first entry.
 *
 * Remembering the last pick means the trigger keeps offering the shape the user actually draws
 * rather than resetting to Rectangle after every use.
 */
function useLastToolPerCategory(activeTool: ToolType): Record<ToolCategory, ToolType> {
	const [last, setLast] = React.useState<Record<ToolCategory, ToolType>>(() => {
		const seed = {} as Record<ToolCategory, ToolType>
		for (const category of Object.keys(CATEGORY_LABELS) as ToolCategory[]) {
			seed[category] = TOOLS_BY_CATEGORY[category][0].tool
		}
		return seed
	})

	React.useEffect(() => {
		const category = TOOL_CATALOG[activeTool].category
		setLast((prev) =>
			prev[category] === activeTool ? prev : { ...prev, [category]: activeTool }
		)
	}, [activeTool])

	return last
}

export function Toolbar({
	activeTool,
	canUndo,
	canRedo,
	hasSelection,
	toolLocked,
	preciseMode,
	onToolChange,
	onToolLockChange,
	onPreciseModeChange,
	onUndo,
	onRedo,
	onExport,
	onBringToFront,
	onBringForward,
	onSendBackward,
	onSendToBack
}: ToolbarProps) {
	const isMobile = useIsMobile()

	const lastPerCategory = useLastToolPerCategory(activeTool)

	const [openMenu, setOpenMenu] = React.useState<OpenMenu>(null)
	const drawTriggerRef = React.useRef<HTMLButtonElement>(null)
	const shapesTriggerRef = React.useRef<HTMLButtonElement>(null)
	const layerTriggerRef = React.useRef<HTMLButtonElement>(null)
	const toolsTriggerRef = React.useRef<HTMLButtonElement>(null)

	// ActionSheet open state for "More" overflow menu
	const [moreOpen, setMoreOpen] = React.useState(false)

	const closeMenu = React.useCallback(() => setOpenMenu(null), [])

	const pickTool = React.useCallback(
		(tool: ToolType) => {
			onToolChange(tool)
			setOpenMenu(null)
		},
		[onToolChange]
	)

	const layerHandlers: Record<LayerActionId, () => void> = {
		front: onBringToFront,
		forward: onBringForward,
		backward: onSendBackward,
		back: onSendToBack
	}

	const toolSection = React.useCallback(
		(category: ToolCategory, withHeading: boolean): ToolPopoverSection => ({
			key: category,
			heading: withHeading ? CATEGORY_LABELS[category] : undefined,
			items: TOOLS_BY_CATEGORY[category].map((descriptor) => ({
				key: descriptor.tool,
				Icon: TOOL_ICONS[descriptor.tool],
				label: descriptor.label,
				shortcut: descriptor.shortcut,
				active: activeTool === descriptor.tool,
				onSelect: () => pickTool(descriptor.tool)
			}))
		}),
		[activeTool, pickTool]
	)

	const layerSection: ToolPopoverSection = {
		key: 'layer',
		items: LAYER_ACTIONS.map((action) => ({
			key: action.id,
			Icon: action.Icon,
			label: action.label,
			shortcut: action.shortcut,
			onSelect: () => {
				layerHandlers[action.id]()
				setOpenMenu(null)
			}
		}))
	}

	// --- Mobile toolbar ---
	if (isMobile) {
		const drawTool = lastPerCategory.draw
		const DrawIcon = TOOL_ICONS[drawTool]
		const drawActive = TOOL_CATALOG[activeTool].category === 'draw'
		// Everything that is not select and not a pen/eraser: shapes, connector, text, embeds
		const toolsCategories: ToolCategory[] = CATEGORY_ORDER.filter((c) => c !== 'draw')
		const toolsActive = toolsCategories.includes(TOOL_CATALOG[activeTool].category)

		return (
			<div className="ideallo-toolbar">
				<ToolButton
					tool="select"
					activeTool={activeTool}
					size={22}
					onToolChange={onToolChange}
				/>

				{/* Draw group: Pen / Eraser */}
				<div className="ideallo-tool-group">
					<button
						type="button"
						ref={drawTriggerRef}
						className={`ideallo-tool-btn has-menu${drawActive ? ' active' : ''}`}
						aria-haspopup="menu"
						aria-expanded={openMenu === 'draw'}
						onClick={() => setOpenMenu((prev) => (prev === 'draw' ? null : 'draw'))}
						title={CATEGORY_LABELS.draw}
						aria-label={CATEGORY_LABELS.draw}
					>
						<DrawIcon size={22} />
						<span className="ideallo-tool-group-indicator" />
					</button>
					<ToolPopover
						open={openMenu === 'draw'}
						onClose={closeMenu}
						sections={[toolSection('draw', false)]}
						anchorRef={drawTriggerRef}
						aria-label={CATEGORY_LABELS.draw}
					/>
				</div>

				{/* Everything else, one labelled row per category */}
				<div className="ideallo-tool-group">
					<button
						type="button"
						ref={toolsTriggerRef}
						className={`ideallo-tool-btn has-menu${toolsActive ? ' active' : ''}`}
						aria-haspopup="menu"
						aria-expanded={openMenu === 'tools'}
						onClick={() => setOpenMenu((prev) => (prev === 'tools' ? null : 'tools'))}
						title="Tools"
						aria-label="Tools"
					>
						<IcToolbox size={22} />
						<span className="ideallo-tool-group-indicator" />
					</button>
					<ToolPopover
						open={openMenu === 'tools'}
						onClose={closeMenu}
						sections={toolsCategories.map((c) => toolSection(c, true))}
						layout="rows"
						anchorRef={toolsTriggerRef}
						aria-label="Tools"
					/>
				</div>

				<div className="ideallo-toolbar-divider" />

				{/* Undo / Redo */}
				<button
					className="ideallo-tool-btn"
					onClick={onUndo}
					disabled={!canUndo}
					title="Undo"
				>
					<IcUndo size={22} />
				</button>

				<button
					className="ideallo-tool-btn"
					onClick={onRedo}
					disabled={!canRedo}
					title="Redo"
				>
					<IcRedo size={22} />
				</button>

				{/* More */}
				<button className="ideallo-tool-btn" onClick={() => setMoreOpen(true)} title="More">
					<IcMore size={22} />
				</button>

				<ActionSheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Actions">
					{hasSelection && (
						<>
							{LAYER_ACTIONS.map((action) => (
								<ActionSheetItem
									key={action.id}
									icon={<action.Icon size={20} />}
									label={action.label}
									onClick={() => {
										layerHandlers[action.id]()
										setMoreOpen(false)
									}}
								/>
							))}
							<ActionSheetDivider />
						</>
					)}
					{/* No checked variant on ActionSheetItem, so the state rides in the label */}
					<ActionSheetItem
						icon={toolLocked ? <IcLocked size={20} /> : <IcUnlocked size={20} />}
						label={`Keep tool active: ${toolLocked ? 'on' : 'off'}`}
						aria-pressed={toolLocked}
						onClick={() => {
							onToolLockChange(!toolLocked)
							setMoreOpen(false)
						}}
					/>
					<ActionSheetItem
						icon={<IcPin size={20} />}
						label={`Precise placement: ${preciseMode ? 'on' : 'off'}`}
						aria-pressed={preciseMode}
						onClick={() => {
							onPreciseModeChange(!preciseMode)
							setMoreOpen(false)
						}}
					/>
					<ActionSheetDivider />
					<ActionSheetItem
						icon={<IcExport size={20} />}
						label="Export"
						onClick={() => {
							onExport()
							setMoreOpen(false)
						}}
					/>
				</ActionSheet>
			</div>
		)
	}

	// --- Desktop toolbar: flat, except the shape family and the z-order actions ---
	const shapeTool = lastPerCategory.shape
	const ShapeIcon = TOOL_ICONS[shapeTool]
	const shapeActive = TOOL_CATALOG[activeTool].category === 'shape'

	return (
		<div className="ideallo-toolbar">
			<ToolButton
				tool="select"
				activeTool={activeTool}
				size={24}
				onToolChange={onToolChange}
			/>

			<div className="ideallo-toolbar-divider" />

			{/* Drawing tools */}
			<ToolButton tool="pen" activeTool={activeTool} size={24} onToolChange={onToolChange} />
			<ToolButton
				tool="eraser"
				activeTool={activeTool}
				size={24}
				onToolChange={onToolChange}
			/>

			<div className="ideallo-toolbar-divider" />

			{/* The shape family behind one trigger, which wears the last shape drawn */}
			<div className="ideallo-tool-group">
				<button
					type="button"
					ref={shapesTriggerRef}
					className={`ideallo-tool-btn has-menu${shapeActive ? ' active' : ''}`}
					aria-haspopup="menu"
					aria-expanded={openMenu === 'shapes'}
					onClick={() => setOpenMenu((prev) => (prev === 'shapes' ? null : 'shapes'))}
					title={CATEGORY_LABELS.shape}
					aria-label={CATEGORY_LABELS.shape}
				>
					<ShapeIcon size={24} />
					<span className="ideallo-tool-group-indicator" />
				</button>
				<ToolPopover
					open={openMenu === 'shapes'}
					onClose={closeMenu}
					sections={[toolSection('shape', false)]}
					anchorRef={shapesTriggerRef}
					aria-label={CATEGORY_LABELS.shape}
				/>
			</div>

			<ToolButton
				tool="connector"
				activeTool={activeTool}
				size={24}
				onToolChange={onToolChange}
			/>
			<ToolButton tool="text" activeTool={activeTool} size={24} onToolChange={onToolChange} />
			<ToolButton
				tool="sticky"
				activeTool={activeTool}
				size={24}
				onToolChange={onToolChange}
			/>
			<ToolButton
				tool="image"
				activeTool={activeTool}
				size={24}
				onToolChange={onToolChange}
			/>
			<ToolButton
				tool="document"
				activeTool={activeTool}
				size={24}
				onToolChange={onToolChange}
			/>

			{/* Tool lock: opt out of the one-shot revert, for placing several of a thing */}
			<button
				type="button"
				className={`ideallo-tool-btn ideallo-tool-lock ${toolLocked ? 'locked' : ''}`}
				aria-pressed={toolLocked}
				onClick={() => onToolLockChange(!toolLocked)}
				title={toolLocked ? 'Keep tool active: on' : 'Keep tool active: off'}
			>
				{toolLocked ? <IcLocked size={24} /> : <IcUnlocked size={24} />}
			</button>

			{/* Precise placement: drop a connector terminal on a free point, not the nearest anchor */}
			<button
				type="button"
				className={`ideallo-tool-btn ${preciseMode ? 'active' : ''}`}
				aria-pressed={preciseMode}
				onClick={() => onPreciseModeChange(!preciseMode)}
				title={
					preciseMode
						? 'Precise placement: on (or hold Alt)'
						: 'Precise placement: off (or hold Alt)'
				}
			>
				<IcPin size={24} />
			</button>

			<div className="ideallo-toolbar-divider" />

			{/* Undo/Redo */}
			<button
				className="ideallo-tool-btn"
				onClick={onUndo}
				disabled={!canUndo}
				title="Undo (Ctrl+Z)"
			>
				<IcUndo size={24} />
			</button>

			<button
				className="ideallo-tool-btn"
				onClick={onRedo}
				disabled={!canRedo}
				title="Redo (Ctrl+Shift+Z)"
			>
				<IcRedo size={24} />
			</button>

			{/* Z-order, behind one trigger and only while there is something to reorder */}
			{hasSelection && (
				<>
					<div className="ideallo-toolbar-divider" />

					<div className="ideallo-tool-group">
						<button
							type="button"
							ref={layerTriggerRef}
							className="ideallo-tool-btn has-menu"
							aria-haspopup="menu"
							aria-expanded={openMenu === 'layer'}
							onClick={() =>
								setOpenMenu((prev) => (prev === 'layer' ? null : 'layer'))
							}
							title="Arrange"
							aria-label="Arrange"
						>
							<IcStack size={24} />
							<span className="ideallo-tool-group-indicator" />
						</button>
						<ToolPopover
							open={openMenu === 'layer'}
							onClose={closeMenu}
							sections={[layerSection]}
							layout="rows"
							iconSize={24}
							anchorRef={layerTriggerRef}
							aria-label="Arrange"
						/>
					</div>
				</>
			)}

			<div className="ideallo-toolbar-divider" />

			{/* Export */}
			<button className="ideallo-tool-btn" onClick={onExport} title="Export">
				<IcExport size={24} />
			</button>
		</div>
	)
}

// vim: ts=4
