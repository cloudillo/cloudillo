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

import { ActionSheet, ActionSheetDivider, ActionSheetItem, useIsMobile } from '@cloudillo/react'
import * as React from 'react'
import type { IconType } from 'react-icons'
import {
	PiExportBold as IcExport,
	PiLockBold as IcLocked,
	PiDotsThreeBold as IcMore,
	PiArrowArcRightBold as IcRedo,
	PiStackBold as IcStack,
	PiToolboxBold as IcToolbox,
	PiArrowArcLeftBold as IcUndo,
	PiLockOpenBold as IcUnlocked
} from 'react-icons/pi'

import type { ToolCategory, ToolType } from '../tools/index.js'
import {
	CATEGORY_LABELS,
	CATEGORY_ORDER,
	canKeepActive,
	isDragCommittedTool,
	TOOL_CATALOG,
	TOOLS_BY_CATEGORY
} from '../tools/index.js'
import { ToolPopover, type ToolPopoverSection } from './ToolPopover.js'
import { LAYER_ACTIONS, type LayerActionId, TOOL_ICONS } from './tool-icons.js'

export interface ToolbarProps {
	activeTool: ToolType
	canUndo: boolean
	canRedo: boolean
	hasSelection: boolean
	/** Keep the active tool armed after a placement instead of reverting to Select */
	toolLocked: boolean
	onToolChange: (tool: ToolType) => void
	onToolLockChange: (locked: boolean) => void
	onUndo: () => void
	onRedo: () => void
	onExport: () => void
	onBringToFront: () => void
	onBringForward: () => void
	onSendBackward: () => void
	onSendToBack: () => void
}

/**
 * The kept-active badge: the lock drawn ON the tool it applies to. aria-hidden - app.tsx's live
 * region already announces "Keep tool active: on/off" and the ... menu's row names the mode.
 */
function KeptBadge() {
	return (
		<span className="ideallo-tool-kept" aria-hidden="true">
			<IcLocked size={12} />
		</span>
	)
}

interface ToolButtonProps {
	tool: ToolType
	activeTool: ToolType
	size: number
	toolLocked: boolean
	onToolChange: (tool: ToolType) => void
	onToolLockChange: (locked: boolean) => void
}

/**
 * The one tool button, used by both layouts and by the popovers' triggers.
 *
 * DOUBLE-CLICK keeps the tool armed after each placement. The gesture lives on the tool itself
 * rather than on a separate padlock button, which read as a tool of its own; the badge below is
 * the state indicator that replaces it, shown on the thing the lock applies to.
 */
function ToolButton({
	tool,
	activeTool,
	size,
	toolLocked,
	onToolChange,
	onToolLockChange
}: ToolButtonProps) {
	const descriptor = TOOL_CATALOG[tool]
	const Icon = TOOL_ICONS[tool]
	const lockable = canKeepActive(tool)
	const kept = lockable && toolLocked && activeTool === tool
	// The tooltip is where the double-click gesture is discoverable, so it carries the hint
	const title = [
		`${descriptor.label} (${descriptor.shortcut})`,
		descriptor.hint,
		lockable && (kept ? 'double-click or Q to release' : 'double-click or Q to keep active')
	]
		.filter(Boolean)
		.join(' · ')
	return (
		<button
			type="button"
			className={`ideallo-tool-btn${activeTool === tool ? ' active' : ''}`}
			aria-pressed={activeTool === tool}
			onClick={() => onToolChange(tool)}
			onDoubleClick={lockable ? () => onToolLockChange(!toolLocked) : undefined}
			title={title}
			aria-label={descriptor.label}
		>
			<Icon size={size} />
			{kept && <KeptBadge />}
		</button>
	)
}

interface ToolGroupButtonProps {
	/** Trigger glyph: the shape/draw triggers wear their last-used member, mobile "Tools" is generic */
	Icon: IconType
	size: number
	label: string
	open: boolean
	onToggle: () => void
	triggerRef: React.RefObject<HTMLButtonElement | null>
	/** True while any member of the group is the armed tool */
	groupActive: boolean
	/**
	 * The group's currently armed member, when there is one. Present means the trigger stands in for
	 * a real tool, so it takes the double-click gesture and the badge - a shape tool exists NOWHERE
	 * ELSE in the desktop bar, so otherwise the shape tools could not be locked by gesture at all.
	 */
	lockTool?: ToolType
	toolLocked: boolean
	onToolLockChange: (locked: boolean) => void
	/** The flyout, rendered inside the positioning context this owns */
	children: React.ReactNode
}

/**
 * A trigger that opens a flyout of tools - and stands in for whichever of them is armed.
 *
 * Double-clicking a trigger flashes its flyout open and shut (click 1 opens, click 2 closes, then
 * the dblclick toggles the lock). Deliberate: deferring the first click behind a double-click timer
 * would cost every ordinary flyout open ~250ms to spare this one gesture its flicker.
 */
function ToolGroupButton({
	Icon,
	size,
	label,
	open,
	onToggle,
	triggerRef,
	groupActive,
	lockTool,
	toolLocked,
	onToolLockChange,
	children
}: ToolGroupButtonProps) {
	const lockable = lockTool !== undefined && canKeepActive(lockTool)
	const kept = lockable && toolLocked
	// Opening the flyout ARMS the group's last-used member, so a trigger with one armed is standing
	// in for that tool - and both the name and the tooltip have to say so, or the only clue that a
	// click just changed the armed tool is the `active` tint, which a screen reader never sees.
	// aria-haspopup/aria-expanded stay as they are: it is still a disclosure, it is just also a tool.
	const armed = lockTool !== undefined ? TOOL_CATALOG[lockTool] : undefined
	const title = [
		armed?.label,
		armed ? `${label} (click for others)` : label,
		lockable && (kept ? 'double-click or Q to release' : 'double-click or Q to keep active')
	]
		.filter(Boolean)
		.join(' · ')
	return (
		<div className="ideallo-tool-group">
			<button
				type="button"
				ref={triggerRef}
				className={`ideallo-tool-btn has-menu${groupActive ? ' active' : ''}`}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={onToggle}
				onDoubleClick={lockable ? () => onToolLockChange(!toolLocked) : undefined}
				title={title}
				aria-label={armed ? `${armed.label} (${label})` : label}
			>
				<Icon size={size} />
				<span className="ideallo-tool-group-indicator" />
				{kept && <KeptBadge />}
			</button>
			{children}
		</div>
	)
}

/** Which popover, if any, is open. A single value is what keeps them mutually exclusive. */
type OpenMenu = 'draw' | 'shapes' | 'layer' | 'tools' | 'more' | null

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
	onToolChange,
	onToolLockChange,
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
	const moreTriggerRef = React.useRef<HTMLButtonElement>(null)

	// ActionSheet open state for "More" overflow menu
	const [moreOpen, setMoreOpen] = React.useState(false)

	/**
	 * What was armed before a group trigger armed its own member, so Escape can put it back.
	 *
	 * Opening a flyout to LOOK at the options otherwise costs the user their Select mode with no way
	 * back. Cleared by every other dismissal below, so an Escape on a later flyout cannot revert to
	 * a tool the user has since left behind.
	 */
	const toolBeforeOpenRef = React.useRef<ToolType | null>(null)

	const closeMenu = React.useCallback(() => {
		toolBeforeOpenRef.current = null
		setOpenMenu(null)
	}, [])

	/** Escape only: the arm-on-open is undone, which no other dismissal does */
	const cancelMenu = React.useCallback(() => {
		const previous = toolBeforeOpenRef.current
		toolBeforeOpenRef.current = null
		setOpenMenu(null)
		if (previous) onToolChange(previous)
	}, [onToolChange])

	/** Opening a group that arms a member; closing it again leaves nothing to revert to */
	const toggleArmingMenu = React.useCallback(
		(menu: Exclude<OpenMenu, null>, tool: ToolType) => {
			if (openMenu === menu) {
				toolBeforeOpenRef.current = null
				setOpenMenu(null)
				return
			}
			// Arming on open makes the remembered tool pay off: the flyout is an offer of
			// alternatives, not a gate you must pass to draw anything.
			toolBeforeOpenRef.current = activeTool
			onToolChange(tool)
			setOpenMenu(menu)
		},
		[openMenu, activeTool, onToolChange]
	)

	/**
	 * Opening a group that arms nothing. Clears the remembered tool for the same reason `closeMenu`
	 * does: a flyout the user has moved on from must not be revertible by a later Escape.
	 */
	const toggleMenu = React.useCallback((menu: Exclude<OpenMenu, null>) => {
		toolBeforeOpenRef.current = null
		setOpenMenu((prev) => (prev === menu ? null : menu))
	}, [])

	const pickTool = React.useCallback(
		(tool: ToolType) => {
			toolBeforeOpenRef.current = null
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
				kept:
					toolLocked && activeTool === descriptor.tool && canKeepActive(descriptor.tool),
				onSelect: () => pickTool(descriptor.tool)
			}))
		}),
		[activeTool, toolLocked, pickTool]
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
			<div className={`ideallo-toolbar${openMenu ? ' menu-open' : ''}`}>
				<ToolButton
					tool="select"
					activeTool={activeTool}
					size={22}
					toolLocked={toolLocked}
					onToolChange={onToolChange}
					onToolLockChange={onToolLockChange}
				/>

				{/* Draw group: Pen / Eraser - neither is lockable, so no gesture and no badge */}
				<ToolGroupButton
					Icon={DrawIcon}
					size={22}
					label={CATEGORY_LABELS.draw}
					open={openMenu === 'draw'}
					onToggle={() => toggleArmingMenu('draw', drawTool)}
					triggerRef={drawTriggerRef}
					groupActive={drawActive}
					lockTool={drawActive ? activeTool : undefined}
					toolLocked={toolLocked}
					onToolLockChange={onToolLockChange}
				>
					<ToolPopover
						open={openMenu === 'draw'}
						onClose={closeMenu}
						onCancel={cancelMenu}
						sections={[toolSection('draw', false)]}
						anchorRef={drawTriggerRef}
						dismissMode={isDragCommittedTool(activeTool) ? 'passthrough' : 'swallow'}
						aria-label={CATEGORY_LABELS.draw}
					/>
				</ToolGroupButton>

				{/* Everything else, one labelled row per category. The armed tool has no other home
				    in this bar, so this trigger is where its lock state is legible. */}
				<ToolGroupButton
					Icon={IcToolbox}
					size={22}
					label="Tools"
					open={openMenu === 'tools'}
					onToggle={() => toggleMenu('tools')}
					triggerRef={toolsTriggerRef}
					groupActive={toolsActive}
					lockTool={toolsActive ? activeTool : undefined}
					toolLocked={toolLocked}
					onToolLockChange={onToolLockChange}
				>
					<ToolPopover
						open={openMenu === 'tools'}
						onClose={closeMenu}
						sections={[
							...toolsCategories.map((c) => toolSection(c, true)),
							{
								// The lock lives next to the tools it governs: on touch the
								// double-click gesture is dead. A LABELLED row also says WHICH
								// lock this is - the property bar's padlock means object lock.
								key: 'modes',
								className: 'modes',
								items: [
									{
										key: 'tool-lock',
										Icon: toolLocked ? IcLocked : IcUnlocked,
										label: 'Keep tool active',
										checkbox: true,
										row: true,
										active: toolLocked,
										// Does NOT close, same as the desktop ... menu: flipping
										// the lock then picking a tool is one visit, in that order.
										onSelect: () => onToolLockChange(!toolLocked)
									}
								]
							}
						]}
						layout="rows"
						anchorRef={toolsTriggerRef}
						dismissMode={isDragCommittedTool(activeTool) ? 'passthrough' : 'swallow'}
						aria-label="Tools"
					/>
				</ToolGroupButton>

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
					{/* Modes are NOT here: the tool lock sits in the Tools flyout, next to the
					    tools it governs, rather than two taps deep among unrelated commands */}
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
		<div className={`ideallo-toolbar${openMenu ? ' menu-open' : ''}`}>
			<ToolButton
				tool="select"
				activeTool={activeTool}
				size={24}
				toolLocked={toolLocked}
				onToolChange={onToolChange}
				onToolLockChange={onToolLockChange}
			/>

			<div className="ideallo-toolbar-divider" />

			{/* Drawing tools */}
			<ToolButton
				tool="pen"
				activeTool={activeTool}
				size={24}
				toolLocked={toolLocked}
				onToolChange={onToolChange}
				onToolLockChange={onToolLockChange}
			/>
			<ToolButton
				tool="eraser"
				activeTool={activeTool}
				size={24}
				toolLocked={toolLocked}
				onToolChange={onToolChange}
				onToolLockChange={onToolLockChange}
			/>

			<div className="ideallo-toolbar-divider" />

			{/* The shape family behind one trigger, which wears the last shape drawn - and, while a
			    shape is armed, takes the lock gesture on its behalf: a shape tool appears nowhere
			    else in this bar. */}
			<ToolGroupButton
				Icon={ShapeIcon}
				size={24}
				label={CATEGORY_LABELS.shape}
				open={openMenu === 'shapes'}
				onToggle={() => toggleArmingMenu('shapes', shapeTool)}
				triggerRef={shapesTriggerRef}
				groupActive={shapeActive}
				lockTool={shapeActive ? activeTool : undefined}
				toolLocked={toolLocked}
				onToolLockChange={onToolLockChange}
			>
				<ToolPopover
					open={openMenu === 'shapes'}
					onClose={closeMenu}
					onCancel={cancelMenu}
					sections={[toolSection('shape', false)]}
					anchorRef={shapesTriggerRef}
					dismissMode={isDragCommittedTool(activeTool) ? 'passthrough' : 'swallow'}
					aria-label={CATEGORY_LABELS.shape}
				/>
			</ToolGroupButton>

			<ToolButton
				tool="connector"
				activeTool={activeTool}
				size={24}
				toolLocked={toolLocked}
				onToolChange={onToolChange}
				onToolLockChange={onToolLockChange}
			/>
			<ToolButton
				tool="text"
				activeTool={activeTool}
				size={24}
				toolLocked={toolLocked}
				onToolChange={onToolChange}
				onToolLockChange={onToolLockChange}
			/>
			<ToolButton
				tool="sticky"
				activeTool={activeTool}
				size={24}
				toolLocked={toolLocked}
				onToolChange={onToolChange}
				onToolLockChange={onToolLockChange}
			/>
			<ToolButton
				tool="image"
				activeTool={activeTool}
				size={24}
				toolLocked={toolLocked}
				onToolChange={onToolChange}
				onToolLockChange={onToolLockChange}
			/>
			<ToolButton
				tool="document"
				activeTool={activeTool}
				size={24}
				toolLocked={toolLocked}
				onToolChange={onToolChange}
				onToolLockChange={onToolLockChange}
			/>

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

					{/* No lockTool: z-order actions are commands, not tools */}
					<ToolGroupButton
						Icon={IcStack}
						size={24}
						label="Arrange"
						open={openMenu === 'layer'}
						onToggle={() => toggleMenu('layer')}
						triggerRef={layerTriggerRef}
						groupActive={false}
						toolLocked={toolLocked}
						onToolLockChange={onToolLockChange}
					>
						<ToolPopover
							open={openMenu === 'layer'}
							onClose={closeMenu}
							sections={[layerSection]}
							layout="rows"
							iconSize={24}
							anchorRef={layerTriggerRef}
							aria-label="Arrange"
						/>
					</ToolGroupButton>
				</>
			)}

			<div className="ideallo-toolbar-divider" />

			{/* Export */}
			<button className="ideallo-tool-btn" onClick={onExport} title="Export">
				<IcExport size={24} />
			</button>

			{/*
				Modes, out of the tool row: a padlock sitting inline among the tools read as a tool
				of its own, and as the same glyph the property bar uses for object lock. A LABELLED
				menu row says which lock it is; the tools themselves take the gesture (double-click).
			*/}
			<div className="ideallo-tool-group">
				<button
					type="button"
					ref={moreTriggerRef}
					className="ideallo-tool-btn"
					aria-haspopup="menu"
					aria-expanded={openMenu === 'more'}
					title="More"
					aria-label="More"
					onClick={() => toggleMenu('more')}
				>
					<IcMore size={24} />
				</button>
				<ToolPopover
					open={openMenu === 'more'}
					onClose={closeMenu}
					layout="menu"
					iconSize={16}
					sections={[
						{
							key: 'modes',
							items: [
								{
									key: 'tool-lock',
									Icon: toolLocked ? IcLocked : IcUnlocked,
									label: 'Keep tool active',
									shortcut: 'Q',
									checkbox: true,
									active: toolLocked,
									// Deliberately does NOT close: a checkbox is a panel
									// control, and panels persist while menus close
									onSelect: () => onToolLockChange(!toolLocked)
								}
							]
						}
					]}
					anchorRef={moreTriggerRef}
					aria-label="More"
				/>
			</div>
		</div>
	)
}

// vim: ts=4
