// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Toolbar component - Main toolbar with drawing tools, formatting, and actions
 *
 * Desktop shows every tool in one row. Mobile (useIsMobile) collapses into
 * Undo/Redo · Select · Insert ▾ · Shapes ▾ · Symbol · Snapping ▾ · More ▾ · Theme.
 */

import {
	Checkbox,
	IcAdd,
	IcAlignBottom,
	IcAlignCenter,
	IcAlignJustify,
	IcAlignLeft,
	IcAlignMiddle,
	IcAlignRight,
	IcAlignTop,
	IcBold,
	IcBringForward,
	IcBringToFront,
	IcDelete,
	IcDocument,
	IcDuplicate,
	IcEllipse,
	IcImage,
	IcItalic,
	IcLine,
	IcMore,
	IcPoll,
	IcQrCode,
	IcRectangle,
	IcRedo,
	IcSelect,
	IcSendBackward,
	IcSendToBack,
	IcSidebar,
	IcText,
	IcUnderline,
	IcUndo,
	Menu,
	MenuDivider,
	MenuItem,
	Popover,
	useIsMobile
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import type { YPrezilloDocument } from '../crdt'
import type { UseSnapSettingsResult } from '../hooks/useSnappingConfig'
import {
	IcAudience,
	IcSnapGrid,
	IcSnapObjects,
	IcSnapSizes,
	IcSnapSpacing,
	IcTable
} from '../icons.js'
import { mergeClasses } from '../utils'
import { FONT_SIZES } from '../utils/text-styles'
import { SymbolPicker } from './SymbolPicker'
import { ThemeDropdown } from './ThemeDropdown'

export interface ToolbarTextStyle {
	hasSelection: boolean
	align?: 'left' | 'center' | 'right' | 'justify'
	verticalAlign?: 'top' | 'middle' | 'bottom'
	fontSize?: number
	bold?: boolean
	italic?: boolean
	underline?: boolean
}

export interface ToolbarTextCmds {
	onAlignChange?: (align: 'left' | 'center' | 'right' | 'justify') => void
	onVerticalAlignChange?: (align: 'top' | 'middle' | 'bottom') => void
	onFontSizeChange?: (size: number) => void
	onBoldToggle?: () => void
	onItalicToggle?: () => void
	onUnderlineToggle?: () => void
}

export interface ToolbarZCmds {
	onBringToFront?: () => void
	onBringForward?: () => void
	onSendBackward?: () => void
	onSendToBack?: () => void
}

export interface ToolbarCmds {
	onDelete?: () => void
	onDuplicate?: () => void
	onUndo?: () => void
	onRedo?: () => void
}

export interface ToolbarProps {
	className?: string
	// Document refs for theme dropdown
	doc?: YPrezilloDocument
	yDoc?: Y.Doc
	// Tool state
	tool: string | null
	setTool: (tool: string | null) => void
	hasSelection: boolean
	canUndo: boolean
	canRedo: boolean
	// Grouped props
	cmds: ToolbarCmds
	zCmds: ToolbarZCmds
	snap: UseSnapSettingsResult
	textStyle: ToolbarTextStyle | null
	textCmds: ToolbarTextCmds
	// Properties panel
	isPanelVisible?: boolean
	onTogglePanel?: () => void
	// Symbol picker
	selectedSymbolId?: string | null
	onSelectSymbol?: (symbolId: string) => void
}

interface Item {
	id: string
	Icon: React.ComponentType
	label: string
	/** Highlighted (tool armed, toggle on, alignment current) */
	on?: boolean
	run?: () => void
}

export function Toolbar({
	className,
	doc,
	yDoc,
	tool,
	setTool,
	hasSelection,
	canUndo,
	canRedo,
	cmds,
	zCmds,
	snap,
	textStyle,
	textCmds,
	isPanelVisible,
	onTogglePanel,
	selectedSymbolId,
	onSelectSymbol
}: ToolbarProps) {
	const { t } = useTranslation()
	const isMobile = useIsMobile()

	const toolItem = (id: string, Icon: React.ComponentType, label: string): Item => ({
		id,
		Icon,
		label,
		on: tool === id,
		run: () => setTool(id)
	})
	const shapeTools = [
		toolItem('rect', IcRectangle, t('Rectangle')),
		toolItem('ellipse', IcEllipse, t('Ellipse')),
		toolItem('line', IcLine, t('Line'))
	]
	const insertTools = [
		toolItem('text', IcText, t('Text')),
		toolItem('image', IcImage, t('Insert Image')),
		toolItem('document', IcDocument, t('Embed Document')),
		toolItem('qrcode', IcQrCode, t('QR Code')),
		toolItem('pollframe', IcPoll, t('Poll Frame')),
		toolItem('tablegrid', IcTable, t('Table Grid')),
		toolItem('statevar', IcAudience, t('Live Users Count'))
	]
	const snapToggles: Item[] = [
		{
			id: 'grid',
			Icon: IcSnapGrid,
			label: t('Snap to grid'),
			on: snap.settings.snapToGrid,
			run: snap.toggleSnapToGrid
		},
		{
			id: 'objects',
			Icon: IcSnapObjects,
			label: t('Snap to objects'),
			on: snap.settings.snapToObjects,
			run: snap.toggleSnapToObjects
		},
		{
			id: 'sizes',
			Icon: IcSnapSizes,
			label: t('Snap to sizes'),
			on: snap.settings.snapToSizes,
			run: snap.toggleSnapToSizes
		},
		{
			id: 'spacing',
			Icon: IcSnapSpacing,
			label: t('Snap to equal spacing'),
			on: snap.settings.snapToDistribution,
			run: snap.toggleSnapToDistribution
		}
	]
	const zOrder: Item[] = [
		{
			id: 'front',
			Icon: IcBringToFront,
			label: t('Bring to front'),
			run: zCmds.onBringToFront
		},
		{
			id: 'forward',
			Icon: IcBringForward,
			label: t('Bring forward'),
			run: zCmds.onBringForward
		},
		{
			id: 'backward',
			Icon: IcSendBackward,
			label: t('Send backward'),
			run: zCmds.onSendBackward
		},
		{ id: 'back', Icon: IcSendToBack, label: t('Send to back'), run: zCmds.onSendToBack }
	]
	const align = (
		id: 'left' | 'center' | 'right' | 'justify',
		Icon: React.ComponentType,
		label: string
	): Item => ({
		id,
		Icon,
		label,
		on: textStyle?.align === id,
		run: () => textCmds.onAlignChange?.(id)
	})
	const hAlign = [
		align('left', IcAlignLeft, t('Align left')),
		align('center', IcAlignCenter, t('Align center')),
		align('right', IcAlignRight, t('Align right')),
		align('justify', IcAlignJustify, t('Justify'))
	]
	const vAlign = (
		id: 'top' | 'middle' | 'bottom',
		Icon: React.ComponentType,
		label: string
	): Item => ({
		id,
		Icon,
		label,
		on: textStyle?.verticalAlign === id,
		run: () => textCmds.onVerticalAlignChange?.(id)
	})
	const vAligns = [
		vAlign('top', IcAlignTop, t('Align top')),
		vAlign('middle', IcAlignMiddle, t('Align middle')),
		vAlign('bottom', IcAlignBottom, t('Align bottom'))
	]
	const textToggles: Item[] = [
		{
			id: 'b',
			Icon: IcBold,
			label: t('Bold'),
			on: textStyle?.bold,
			run: textCmds.onBoldToggle
		},
		{
			id: 'i',
			Icon: IcItalic,
			label: t('Italic'),
			on: textStyle?.italic,
			run: textCmds.onItalicToggle
		},
		{
			id: 'u',
			Icon: IcUnderline,
			label: t('Underline'),
			on: textStyle?.underline,
			run: textCmds.onUnderlineToggle
		}
	]

	/** `pressed` adds aria-pressed: set for toggles, left off for one-shot actions */
	const button = (item: Item, pressed?: boolean) => (
		<button
			key={item.id}
			type="button"
			onClick={item.run}
			className={mergeClasses('c-button icon', item.on ? 'active' : '')}
			title={item.label}
			aria-label={item.label}
			aria-pressed={pressed ? !!item.on : undefined}
		>
			<item.Icon />
		</button>
	)
	const menuItem = (item: Item, mode?: 'checked' | 'selected') => (
		<MenuItem
			key={item.id}
			icon={<item.Icon />}
			label={item.label}
			checked={mode === 'checked' ? !!item.on : undefined}
			selected={mode === 'selected' ? !!item.on : undefined}
			onClick={item.run}
		/>
	)

	const undoRedo = (
		<>
			<button
				type="button"
				onClick={cmds.onUndo}
				className="c-button icon"
				disabled={!canUndo}
				title={t('Undo')}
				aria-label={t('Undo')}
			>
				<IcUndo />
			</button>
			<button
				type="button"
				onClick={cmds.onRedo}
				className="c-button icon"
				disabled={!canRedo}
				title={t('Redo')}
				aria-label={t('Redo')}
			>
				<IcRedo />
			</button>
		</>
	)
	const selectButton = button(
		{
			id: 'select',
			Icon: IcSelect,
			label: t('Select'),
			on: tool === null,
			run: () => setTool(null)
		},
		true
	)
	const symbolPicker = (
		<SymbolPicker
			isActive={tool === 'symbol'}
			selectedSymbolId={selectedSymbolId ?? null}
			onSelectSymbol={(symbolId) => {
				onSelectSymbol?.(symbolId)
				setTool('symbol')
			}}
			onClose={() => {
				if (tool === 'symbol') setTool(null)
			}}
		/>
	)
	// One popover on all widths; checkboxes rather than menu items so it stays open across toggles
	const snapping = (
		<Popover
			trigger={
				<button
					type="button"
					className={mergeClasses(
						'c-button icon',
						snapToggles.some((s) => s.on) ? 'active' : ''
					)}
					title={t('Snapping')}
					aria-label={t('Snapping')}
				>
					<IcSnapGrid />
				</button>
			}
		>
			<div className="c-vbox g-2 p-2">
				{snapToggles.map((s) => (
					<Checkbox key={s.id} label={s.label} checked={!!s.on} onChange={s.run} />
				))}
			</div>
		</Popover>
	)
	const theme = doc && yDoc && <ThemeDropdown doc={doc} yDoc={yDoc} />

	if (isMobile) {
		const activeShape = shapeTools.find((s) => s.on)
		const ShapeIcon = activeShape?.Icon ?? IcRectangle
		return (
			<div className={mergeClasses('c-nav c-hbox p-1 mb-1', className)}>
				{undoRedo}
				{selectButton}
				<Menu
					trigger={
						<button
							type="button"
							className={mergeClasses(
								'c-button icon',
								insertTools.some((i) => i.on) ? 'active' : ''
							)}
							title={t('Insert')}
							aria-label={t('Insert')}
						>
							<IcAdd />
						</button>
					}
				>
					{insertTools.map((item) => menuItem(item, 'selected'))}
				</Menu>
				<Menu
					trigger={
						<button
							type="button"
							className={mergeClasses('c-button icon', activeShape ? 'active' : '')}
							title={t('Shapes')}
							aria-label={t('Shapes')}
						>
							<ShapeIcon />
						</button>
					}
				>
					{shapeTools.map((item) => menuItem(item, 'selected'))}
				</Menu>
				{symbolPicker}
				{snapping}
				{hasSelection && (
					<Menu
						trigger={
							<button
								type="button"
								className="c-button icon"
								title={t('More')}
								aria-label={t('More')}
							>
								<IcMore />
							</button>
						}
					>
						{zOrder.map((item) => menuItem(item))}
						{textStyle?.hasSelection && (
							<>
								<MenuDivider />
								{hAlign.map((item) => menuItem(item, 'selected'))}
								<MenuDivider />
								{vAligns.map((item) => menuItem(item, 'selected'))}
								<MenuDivider />
								{textToggles.map((item) => menuItem(item, 'checked'))}
							</>
						)}
						<MenuDivider />
						{menuItem({
							id: 'duplicate',
							Icon: IcDuplicate,
							label: t('Duplicate'),
							run: cmds.onDuplicate
						})}
						{menuItem({
							id: 'delete',
							Icon: IcDelete,
							label: t('Delete'),
							run: cmds.onDelete
						})}
					</Menu>
				)}
				<div className="flex-fill" />
				{/* The panel toggle is omitted: the properties panel never renders on mobile */}
				{theme}
			</div>
		)
	}

	return (
		<div className={mergeClasses('c-nav c-hbox p-1 mb-1', className)}>
			{undoRedo}

			<div className="c-toolbar-divider" />

			{selectButton}

			<div className="c-toolbar-divider" />

			{shapeTools.map((item) => button(item, true))}

			<div className="c-toolbar-divider" />

			{insertTools.map((item) => button(item, true))}
			{symbolPicker}

			<div className="c-toolbar-divider" />

			{snapping}

			<div className="flex-fill" />

			{/* Contextual: Object selection */}
			{hasSelection && (
				<>
					<div className="c-toolbar-divider" />

					{zOrder.map((item) => button(item))}

					{/* Contextual: Text selection */}
					{textStyle?.hasSelection && (
						<>
							<div className="c-toolbar-divider" />
							{hAlign.map((item) => button(item, true))}
							<div className="c-toolbar-divider" />
							{vAligns.map((item) => button(item, true))}
							<div className="c-toolbar-divider" />

							{/* Font size */}
							<select
								value={textStyle?.fontSize || 16}
								onChange={(e) =>
									textCmds.onFontSizeChange?.(Number(e.target.value))
								}
								className="c-input c-font-size-select"
								title={t('Font size')}
							>
								{FONT_SIZES.map((size) => (
									<option key={size} value={size}>
										{size}
									</option>
								))}
							</select>

							<div className="c-toolbar-divider" />
							{textToggles.map((item) => button(item, true))}
						</>
					)}

					<div className="c-toolbar-divider" />

					<button
						type="button"
						onClick={cmds.onDuplicate}
						className="c-button icon"
						title={`${t('Duplicate')} (Ctrl+D)`}
						aria-label={t('Duplicate')}
					>
						<IcDuplicate />
					</button>
					{button({
						id: 'delete',
						Icon: IcDelete,
						label: t('Delete'),
						run: cmds.onDelete
					})}
				</>
			)}

			{theme}

			<div className="c-toolbar-divider" />

			{/* Panel toggle; style.css hides it below 48rem by its class (the label is translated) */}
			<button
				type="button"
				onClick={onTogglePanel}
				className={mergeClasses(
					'c-button icon c-panel-toggle',
					isPanelVisible ? 'active' : ''
				)}
				title={t('Toggle properties panel')}
				aria-label={t('Toggle Panel')}
				aria-pressed={!!isPanelVisible}
			>
				<IcSidebar />
			</button>
		</div>
	)
}

// vim: ts=4
