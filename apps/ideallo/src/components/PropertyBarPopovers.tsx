// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The property bar's popovers.
 *
 * The bar itself is icon-only, so every control in here carries the visible label the bar does not.
 * That is the trade: identification is one click deeper, and in exchange the bar is ~200-330px
 * rather than ~750-990px and fits a phone.
 */

import { FontPicker, NativeSelect, NumberInput, useEscapeKey } from '@cloudillo/react'
import * as React from 'react'
import {
	PiAlignBottomBold as IcAlignBottom,
	PiTextAlignCenterBold as IcAlignCenter,
	PiTextAlignJustifyBold as IcAlignJustify,
	PiTextAlignLeftBold as IcAlignLeft,
	PiAlignCenterVerticalBold as IcAlignMiddle,
	PiTextAlignRightBold as IcAlignRight,
	PiAlignTopBold as IcAlignTop,
	PiCopyBold as IcDuplicate,
	PiLockBold as IcLocked,
	PiArrowsLeftRightBold as IcSwap,
	PiTrashBold as IcTrash,
	PiLockOpenBold as IcUnlocked
} from 'react-icons/pi'

import { arrowheadGeometry } from '../connectors/index.js'
import type { ArrowheadType, ArrowStyle, TextAlign, VerticalAlign } from '../crdt/index.js'
import { useEdgeClamp } from '../hooks/useEdgeClamp.js'
import { CORNER_RADII, STROKE_WIDTHS } from '../utils/colors.js'
import { FONT_SIZES } from '../utils/text-styles.js'
import { ColorPalette } from './ColorPalette.js'

/** Arrowhead shapes offered in the picker, in the order they appear */
const ARROWHEAD_CHOICES: { type: ArrowheadType; label: string }[] = [
	{ type: 'none', label: 'None' },
	{ type: 'arrow', label: 'Arrow' },
	{ type: 'triangle', label: 'Triangle' },
	{ type: 'circle', label: 'Circle' },
	{ type: 'diamond', label: 'Diamond' },
	{ type: 'bar', label: 'Bar' }
]

/** Shapes whose head can be hollow. The open V has no interior to fill. */
const FILLABLE: ArrowheadType[] = ['triangle', 'circle', 'diamond']

export const TEXT_ALIGN_CHOICES: { value: TextAlign; title: string; Icon: typeof IcAlignLeft }[] = [
	{ value: 'left', title: 'Align left', Icon: IcAlignLeft },
	{ value: 'center', title: 'Align centre', Icon: IcAlignCenter },
	{ value: 'right', title: 'Align right', Icon: IcAlignRight },
	{ value: 'justify', title: 'Justify', Icon: IcAlignJustify }
]

const VERTICAL_ALIGN_CHOICES: { value: VerticalAlign; title: string; Icon: typeof IcAlignTop }[] = [
	{ value: 'top', title: 'Align top', Icon: IcAlignTop },
	{ value: 'middle', title: 'Align middle', Icon: IcAlignMiddle },
	{ value: 'bottom', title: 'Align bottom', Icon: IcAlignBottom }
]

/**
 * A tiny preview of a head shape, drawn by the SAME function the canvas uses.
 * A swatch therefore cannot drift from what the arrow actually renders.
 */
export function ArrowheadSwatch({ type, size = 26 }: { type: ArrowheadType; size?: number }) {
	const strokeWidth = 2
	const tip: [number, number] = [size - 4, size / 2]
	const geo = arrowheadGeometry({ type }, tip, [1, 0], strokeWidth)
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
			<g stroke="currentColor" strokeWidth={strokeWidth} fill="none" strokeLinejoin="round">
				<line x1={2} y1={size / 2} x2={size - 4} y2={size / 2} />
				{geo && <path d={geo.d} fill={geo.filled ? 'currentColor' : 'none'} />}
			</g>
		</svg>
	)
}

/** Controls a popover may hand its opening focus to. Skips disabled and untabbable nodes. */
const FOCUSABLE =
	'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** What every bar popover needs beyond its own controls: how to close, and what opened it. */
export interface BarPopoverChrome {
	/**
	 * Accessible name for the panel, and the id the trigger's `aria-controls` points at. Both come
	 * from PropertyBar, which already owns the trigger's own label and id - passing them down is
	 * what stops the two drifting apart.
	 */
	label: string
	panelId: string
	/** Escape and the focus return both need it. A popover is mounted only while open. */
	onClose: () => void
	/** The trigger button, so focus lands back on it when the panel closes */
	anchorRef?: React.RefObject<HTMLElement | null>
	/**
	 * Whether the panel takes focus on open and returns it on close. Default true.
	 *
	 * Pass false while a Quill editor is live: moving focus in would blur the editor being
	 * formatted, which is the very thing the `preventBlur` mousedown handlers exist to stop. Nothing
	 * is lost by it - with focus in Quill the keydown target is inside `[data-rich-text-editor]`, so
	 * app.tsx's `isEditableTarget` suppresses shortcuts on that branch instead.
	 */
	manageFocus?: boolean
}

/**
 * Shared chrome for every bar popover, plus the edge clamp (see `useEdgeClamp`).
 *
 * Everything carries `.ideallo-bar-popover`, which is also one of the selectors
 * `utils/editable-target.ts` uses to stop tool shortcuts firing into an open panel - one class
 * means no popover can be forgotten there.
 *
 * Taking focus is part of that contract, not a nicety: while focus stayed on the TRIGGER the
 * keydown target was outside the panel, `isEditableTarget`'s `closest()` test never engaged, and `r`
 * typed into an open fill palette switched the active tool underneath it. `isPopoverOpen` now
 * covers the case regardless, which is what makes `manageFocus={false}` safe.
 */
export function BarPopover({
	label,
	panelId,
	className,
	onClose,
	anchorRef,
	manageFocus = true,
	children
}: BarPopoverChrome & {
	className?: string
	children: React.ReactNode
}) {
	const { ref, shift, placement, maxHeight } = useEdgeClamp({ side: 'below', flip: true, gap: 8 })

	// Escape closes THIS panel and nothing more. It deliberately does not stopPropagation: app.tsx's
	// own Escape handler - which would clear the whole selection and unmount the bar - bails while
	// any popover is open, so Escape still unwinds one level at a time.
	useEscapeKey(onClose)

	// Same shape as ToolPopover's: focus the first enabled control on open, hand focus back to the
	// trigger on close, so the panel is operable and escapable from the keyboard alone.
	React.useEffect(() => {
		if (!manageFocus) return
		const trigger = anchorRef?.current ?? null
		ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
		return () => {
			if (trigger?.isConnected) trigger.focus()
		}
	}, [ref, anchorRef, manageFocus])

	// Tab CLOSES, the same contract ToolPopover keeps: without it focus walks past the last control
	// and lands behind the bar while the panel stays open and visible. The unmount effect above
	// hands focus back to the trigger, so Tab then continues from there as expected. Not a focus
	// trap - matching the sibling popover is both smaller and more consistent.
	const handleKeyDown = React.useCallback(
		(evt: React.KeyboardEvent<HTMLDivElement>) => {
			if (evt.key === 'Tab') onClose()
		},
		[onClose]
	)

	return (
		<div
			ref={ref}
			id={panelId}
			className={`ideallo-bar-popover${placement === 'above' ? ' above' : ''}${className ? ' ' + className : ''}`}
			style={
				{
					'--popover-shift': `${shift}px`,
					maxHeight: maxHeight ?? undefined,
					overflowY: maxHeight != null ? 'auto' : undefined
				} as React.CSSProperties
			}
			role="group"
			aria-label={label}
			onKeyDown={handleKeyDown}
		>
			{children}
		</div>
	)
}

/** One labelled line inside a popover: the label the bar no longer shows, plus its control */
function PopoverRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="ideallo-popover-row">
			<span className="ideallo-property-label">{label}</span>
			{children}
		</div>
	)
}

/**
 * Width as a row of presets rather than a number field: a thickness is picked by eye, and each
 * swatch IS the line it sets, so the row reads as a ramp instead of asking for a pixel count.
 */
function StrokeWidthPicker({ value, onChange }: { value: number; onChange: (w: number) => void }) {
	return (
		<PopoverRow label="Width">
			{STROKE_WIDTHS.map((w) => (
				<button
					key={w}
					type="button"
					className={`ideallo-width-swatch${value === w ? ' selected' : ''}`}
					onClick={() => onChange(w)}
					title={`${w}px`}
					aria-label={`Width ${w}px`}
					aria-pressed={value === w}
				>
					<span style={{ height: w }} />
				</button>
			))}
		</PopoverRow>
	)
}

/** Side of the square in the corner-radius glyph. Half of it, 8, would be a full pill. */
const RADIUS_GLYPH_SIZE = 16

/**
 * The rx to DRAW per preset, which is not the preset's own value.
 *
 * A radius applies to shapes of every size, so no scale lets the glyph show the real number:
 * clamping the value into the 16px square collapses 12 and 24 onto the same pill, since both exceed
 * half of it. This ladder keeps every step visibly distinct while stopping short of a pill at the
 * top, which would promise more than the preset delivers. Exact pixels are in the tooltip and the
 * aria-label.
 *
 * Keyed by preset rather than by index, so a change to CORNER_RADII is a compile error here.
 */
const RADIUS_GLYPH_RX: Record<(typeof CORNER_RADII)[number], number> = { 0: 0, 4: 2, 12: 4, 24: 6 }

/**
 * Corner radius as a ladder of glyphs, for the same reason the width picker is one: a roundness is
 * picked by eye, and each swatch IS the corner it sets.
 */
export function CornerRadiusPicker({
	value,
	onChange
}: {
	value: number
	onChange: (r: number) => void
}) {
	return (
		<PopoverRow label="Corners">
			{CORNER_RADII.map((r) => (
				<button
					key={r}
					type="button"
					className={`ideallo-radius-swatch${value === r ? ' selected' : ''}`}
					onClick={() => onChange(r)}
					title={`${r}px`}
					aria-label={`Corner radius ${r}px`}
					aria-pressed={value === r}
				>
					<svg width={20} height={20} aria-hidden="true">
						<rect
							x={2}
							y={2}
							width={RADIUS_GLYPH_SIZE}
							height={RADIUS_GLYPH_SIZE}
							rx={RADIUS_GLYPH_RX[r]}
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
						/>
					</svg>
				</button>
			))}
		</PopoverRow>
	)
}

export interface StrokePopoverProps extends BarPopoverChrome {
	value: string
	onChange: (color: string) => void
	/** Stroke width is a stroke property; putting it here also frees an inline slot */
	width?: number
	onWidthChange?: (width: number) => void
	/** Clearing the stroke here would leave the object with no paint at all */
	disableTransparent?: boolean
}

/**
 * The stroke is clearable exactly like the fill - the two popovers differ by the width picker
 * alone. What stops an object being cleared into invisibility is the disabled "None" swatch.
 */
export function StrokePopover({
	value,
	onChange,
	width,
	onWidthChange,
	disableTransparent,
	label,
	panelId,
	onClose,
	anchorRef
}: StrokePopoverProps) {
	return (
		<BarPopover
			className="ideallo-stroke-popover"
			label={label}
			panelId={panelId}
			onClose={onClose}
			anchorRef={anchorRef}
		>
			<ColorPalette
				value={value}
				onChange={onChange}
				showTransparent
				disableTransparent={disableTransparent}
			/>
			{width !== undefined && onWidthChange && (
				<StrokeWidthPicker value={width} onChange={onWidthChange} />
			)}
		</BarPopover>
	)
}

export function FillPopover({
	value,
	onChange,
	disableTransparent,
	label,
	panelId,
	onClose,
	anchorRef
}: BarPopoverChrome & {
	value: string
	onChange: (color: string) => void
	disableTransparent?: boolean
}) {
	return (
		<BarPopover label={label} panelId={panelId} onClose={onClose} anchorRef={anchorRef}>
			<ColorPalette
				value={value}
				onChange={onChange}
				showTransparent
				disableTransparent={disableTransparent}
			/>
		</BarPopover>
	)
}

export interface TextPopoverProps extends BarPopoverChrome {
	/** null for a mixed selection: no value is shown, but picking one applies it to all */
	fontFamily: string | null
	fontSize: number | null
	onFontFamilyChange: (fontFamily: string) => void
	onFontSizeChange: (fontSize: number) => void
}

export function TextPopover({
	fontFamily,
	fontSize,
	onFontFamilyChange,
	onFontSizeChange,
	label,
	panelId,
	onClose,
	anchorRef,
	manageFocus
}: TextPopoverProps) {
	return (
		<BarPopover
			className="ideallo-text-popover"
			label={label}
			panelId={panelId}
			onClose={onClose}
			anchorRef={anchorRef}
			manageFocus={manageFocus}
		>
			<PopoverRow label="Font">
				<FontPicker value={fontFamily ?? ''} onChange={onFontFamilyChange} />
			</PopoverRow>
			<PopoverRow label="Size">
				<NativeSelect
					value={fontSize ?? ''}
					onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10))}
					aria-label="Font size"
				>
					{fontSize === null && <option value="">—</option>}
					{FONT_SIZES.map((size) => (
						<option key={size} value={size}>
							{size}px
						</option>
					))}
				</NativeSelect>
			</PopoverRow>
		</BarPopover>
	)
}

export interface AlignPopoverProps extends BarPopoverChrome {
	textAlign: TextAlign | null
	verticalAlign: VerticalAlign | null
	/** Sticky only: a text label is sized to its own content and has nowhere to sit vertically */
	showVAlign: boolean
	onTextAlignChange: (align: TextAlign) => void
	onVerticalAlignChange: (align: VerticalAlign) => void
	/** Quill blurs on mousedown, and blur closes the editor being formatted */
	preventBlur: (e: React.MouseEvent) => void
}

export function AlignPopover({
	textAlign,
	verticalAlign,
	showVAlign,
	onTextAlignChange,
	onVerticalAlignChange,
	preventBlur,
	label,
	panelId,
	onClose,
	anchorRef,
	manageFocus
}: AlignPopoverProps) {
	return (
		<BarPopover
			className="ideallo-align-popover"
			label={label}
			panelId={panelId}
			onClose={onClose}
			anchorRef={anchorRef}
			manageFocus={manageFocus}
		>
			<PopoverRow label="Align">
				{TEXT_ALIGN_CHOICES.map(({ value, title, Icon }) => (
					<button
						key={value}
						type="button"
						className={`ideallo-format-btn${textAlign === value ? ' active' : ''}`}
						onMouseDown={preventBlur}
						onClick={() => onTextAlignChange(value)}
						title={title}
						aria-label={title}
						aria-pressed={textAlign === value}
					>
						<Icon size={14} />
					</button>
				))}
			</PopoverRow>
			{showVAlign && (
				<PopoverRow label="V.Align">
					{VERTICAL_ALIGN_CHOICES.map(({ value, title, Icon }) => (
						<button
							key={value}
							type="button"
							className={`ideallo-format-btn${verticalAlign === value ? ' active' : ''}`}
							onMouseDown={preventBlur}
							onClick={() => onVerticalAlignChange(value)}
							title={title}
							aria-label={title}
							aria-pressed={verticalAlign === value}
						>
							<Icon size={14} />
						</button>
					))}
				</PopoverRow>
			)}
		</BarPopover>
	)
}

export interface ArrowheadPopoverProps extends BarPopoverChrome {
	start: ArrowStyle
	end: ArrowStyle
	onChange: (terminal: 'start' | 'end', style: ArrowStyle) => void
}

export function ArrowheadPopover({
	start,
	end,
	onChange,
	label,
	panelId,
	onClose,
	anchorRef
}: ArrowheadPopoverProps) {
	return (
		<BarPopover
			className="ideallo-arrowhead-popover"
			label={label}
			panelId={panelId}
			onClose={onClose}
			anchorRef={anchorRef}
		>
			<ArrowheadGrid label="Start" value={start} onChange={(s) => onChange('start', s)} />
			<ArrowheadGrid label="End" value={end} onChange={(s) => onChange('end', s)} />
		</BarPopover>
	)
}

/** One 6-cell grid of head shapes, plus the fill and size controls for the fillable ones */
function ArrowheadGrid({
	label,
	value,
	onChange
}: {
	label: string
	value: ArrowStyle
	onChange: (style: ArrowStyle) => void
}) {
	const canFill = FILLABLE.includes(value.type)
	return (
		<div className="ideallo-arrowhead-grid">
			<div className="ideallo-property-label">{label}</div>
			<div className="ideallo-arrowhead-cells">
				{ARROWHEAD_CHOICES.map((choice) => (
					<button
						key={choice.type}
						type="button"
						className={`palette-swatch${value.type === choice.type ? ' selected' : ''}`}
						onClick={() => onChange({ ...value, type: choice.type })}
						title={choice.label}
						aria-label={choice.label}
						aria-pressed={value.type === choice.type}
					>
						<ArrowheadSwatch type={choice.type} />
					</button>
				))}
			</div>
			{canFill && (
				<label className="ideallo-arrowhead-option">
					<input
						type="checkbox"
						checked={value.filled ?? true}
						onChange={(e) => onChange({ ...value, filled: e.target.checked })}
					/>
					<span>Filled</span>
				</label>
			)}
			{value.type !== 'none' && (
				<label className="ideallo-arrowhead-option">
					<span>Size</span>
					<NumberInput
						value={Math.round((value.size ?? 1) * 100)}
						onChange={(v) => onChange({ ...value, size: v / 100 })}
						min={50}
						max={300}
						step={25}
						suffix="%"
						style={{ width: 76 }}
					/>
				</label>
			)}
		</div>
	)
}

/** tldraw's ladder: five stops from nearly invisible to solid, no values in between */
export const OPACITY_STOPS = [0.1, 0.25, 0.5, 0.75, 1] as const

export function OpacitySlider({
	value,
	onChange
}: {
	value: number
	onChange: (opacity: number) => void
}) {
	// A pre-existing object may carry any opacity; snap the HANDLE to the nearest stop but keep
	// showing the real number, so the readout never lies about what is stored.
	const index = OPACITY_STOPS.reduce(
		(best, stop, i) =>
			Math.abs(stop - value) < Math.abs(OPACITY_STOPS[best] - value) ? i : best,
		0
	)
	// Not a constant id: the desktop menu and the mobile sheet must not collide on the datalist
	const listId = React.useId()
	return (
		<PopoverRow label="Opacity">
			<input
				type="range"
				className="ideallo-opacity-slider"
				min={0}
				max={OPACITY_STOPS.length - 1}
				step={1}
				list={listId}
				value={index}
				onChange={(e) => onChange(OPACITY_STOPS[Number(e.target.value)])}
				aria-label="Opacity"
				aria-valuetext={`${Math.round(value * 100)}%`}
			/>
			<datalist id={listId}>
				{OPACITY_STOPS.map((stop, i) => (
					<option key={stop} value={i} />
				))}
			</datalist>
			<span className="ideallo-opacity-value">{Math.round(value * 100)}%</span>
		</PopoverRow>
	)
}

export interface OverflowMenuProps extends BarPopoverChrome {
	opacity: number
	onOpacityChange: (opacity: number) => void
	/** Both present only when every selected object accepts a corner radius */
	cornerRadius?: number
	onCornerRadiusChange?: (radius: number) => void
	/** Mixed lock states resolve towards locking, so one click makes the selection consistent */
	anyUnlocked: boolean
	onToggleLock: () => void
	/** Connectors only: absent unless every selected object is one. Disabled by `anyUnlocked`. */
	onReverse?: () => void
	onDuplicate: () => void
	/** False when an all-locked selection has nothing to delete */
	canDelete: boolean
	onDelete: () => void
}

/**
 * The desktop `…` panel. An OVERFLOW menu rather than an actions menu: opacity is a real object
 * property with no inline slot, and it is the first thing in here. Mobile uses the ActionSheet in
 * PropertyBar.tsx instead.
 */
export function OverflowMenu({
	opacity,
	onOpacityChange,
	cornerRadius,
	onCornerRadiusChange,
	anyUnlocked,
	onToggleLock,
	onReverse,
	onDuplicate,
	canDelete,
	onDelete,
	label,
	panelId,
	onClose,
	anchorRef
}: OverflowMenuProps) {
	return (
		<BarPopover
			className="ideallo-overflow-popover"
			label={label}
			panelId={panelId}
			onClose={onClose}
			anchorRef={anchorRef}
		>
			<OpacitySlider value={opacity} onChange={onOpacityChange} />
			{cornerRadius !== undefined && onCornerRadiusChange && (
				<CornerRadiusPicker value={cornerRadius} onChange={onCornerRadiusChange} />
			)}
			<div className="ideallo-popover-divider" />
			<button
				type="button"
				className="ideallo-property-menu-item"
				onClick={onToggleLock}
				aria-pressed={!anyUnlocked}
			>
				{anyUnlocked ? <IcUnlocked size={16} /> : <IcLocked size={16} />}
				<span>{anyUnlocked ? 'Lock' : 'Unlock'}</span>
			</button>
			{onReverse && (
				<button
					type="button"
					className="ideallo-property-menu-item"
					disabled={!anyUnlocked}
					onClick={onReverse}
				>
					<IcSwap size={16} />
					<span>Reverse direction</span>
				</button>
			)}
			<button type="button" className="ideallo-property-menu-item" onClick={onDuplicate}>
				<IcDuplicate size={16} />
				<span>Duplicate</span>
				<span className="ideallo-property-menu-shortcut">Ctrl+D</span>
			</button>
			<button
				type="button"
				className="ideallo-property-menu-item ideallo-action-danger"
				disabled={!canDelete}
				onClick={onDelete}
			>
				<IcTrash size={16} />
				<span>Delete</span>
				<span className="ideallo-property-menu-shortcut">Del</span>
			</button>
		</BarPopover>
	)
}

// vim: ts=4
