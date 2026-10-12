// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Status bar: mode chip + key hints, page n of m, "Updating layout…" for slow relayouts, overset,
 * zoom, and the View popover.
 */

import {
	Button,
	Kbd,
	NativeSelect,
	Popover,
	PropertyField,
	Toggle,
	VisuallyHidden
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuEye as IcView, LuZoomIn as IcZoomIn, LuZoomOut as IcZoomOut } from 'react-icons/lu'

import type { ViewPrefs } from '../editor/FrameOverlay'
import type { LayoutState } from '../layout/useLayout'
import { LENGTH_UNITS, type LengthUnit, useLengthUnit } from '../ui/LengthInput'
import type { Zoom } from './PageList'

/** The current editing mode: a short chip, `[key, action]` hints, the full sentence. */
export interface ModeInfo {
	chip: string
	hints: [key: string, action: string][]
	/** Announced by the live region. */
	spoken: string
}

/** `flag`, but only once it has held for `ms` (no flicker for quick states). */
export function useDelayed(flag: boolean, ms: number): boolean {
	const [on, setOn] = React.useState(false)
	React.useEffect(() => {
		setOn(false)
		if (!flag) return
		const timer = setTimeout(() => setOn(true), ms)
		return () => clearTimeout(timer)
	}, [flag, ms])
	return flag && on
}

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400]

export interface StatusBarProps {
	/** Current editing mode and how to leave it. */
	mode?: ModeInfo
	/** View preferences. Absent = no View button. */
	view?: ViewPrefs
	setView?(p: Partial<ViewPrefs>): void
	/** Global index of the current page. */
	current: number
	pageCount: number
	pending: boolean
	overset: LayoutState['overset']
	zoom: Zoom
	/** Effective zoom percent. */
	zoomPct: number
	onZoom(z: Zoom): void
	/** Jump to the (first) overset spot. */
	onOverset(): void
}

export function StatusBar({
	mode,
	view,
	setView,
	current,
	pageCount,
	pending,
	overset,
	zoom,
	zoomPct,
	onZoom,
	onOverset
}: StatusBarProps) {
	const { t } = useTranslation()
	const updating = useDelayed(pending && pageCount > 0, 500)
	const zoomIn = ZOOM_STEPS.find((z) => z > zoomPct) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
	const zoomOut = [...ZOOM_STEPS].reverse().find((z) => z < zoomPct) ?? ZOOM_STEPS[0]
	const [unit, setUnit] = useLengthUnit()

	return (
		<div className="c-hbox pagillo-status">
			{mode && (
				<span className="pagillo-mode">
					<span className="pagillo-mode-chip">{mode.chip}</span>
					{view?.keyHints !== false &&
						mode.hints.map(([key, action]) => (
							<span key={key} className="pagillo-mode-hint">
								<Kbd>{key}</Kbd> {action}
							</span>
						))}
				</span>
			)}
			<VisuallyHidden aria-live="polite">{mode?.spoken}</VisuallyHidden>
			<span aria-live="polite">
				{pageCount > 0 &&
					t(pending ? 'Page {{n}} of {{m}}…' : 'Page {{n}} of {{m}}', {
						n: Math.min(current + 1, pageCount),
						m: pageCount
					})}
			</span>
			{updating && <span className="text-muted">{t('Updating layout…')}</span>}
			{overset.length > 0 && (
				<Button
					variant="link"
					onClick={onOverset}
					title={t('Show where the text does not fit')}
				>
					{t('Overflowing text: {{n}}', { n: overset.length })}
				</Button>
			)}
			<span className="flex-fill" />
			{view && setView && (
				<Popover
					placement="top-end"
					trigger={
						<Button variant="link" icon={<IcView />}>
							{t('View')}
						</Button>
					}
				>
					<div className="c-vbox g-2 p-2">
						<PropertyField label={t('Units')}>
							<NativeSelect
								value={unit}
								onChange={(e) => setUnit(e.target.value as LengthUnit)}
							>
								{LENGTH_UNITS.map((u) => (
									<option key={u} value={u}>
										{u}
									</option>
								))}
							</NativeSelect>
						</PropertyField>
						<Toggle
							label={t('Show rulers')}
							checked={view.rulers}
							onChange={(e) => setView({ rulers: e.target.checked })}
						/>
						<Toggle
							label={t('Snap to margins, columns and frames')}
							checked={view.snap}
							onChange={(e) => setView({ snap: e.target.checked })}
						/>
						<Toggle
							label={t('Show guides')}
							checked={view.guides}
							onChange={(e) => setView({ guides: e.target.checked })}
						/>
						<Toggle
							label={t('Show key hints')}
							checked={view.keyHints}
							onChange={(e) => setView({ keyHints: e.target.checked })}
						/>
					</div>
				</Popover>
			)}
			<Button variant="link" aria-pressed={zoom === 'width'} onClick={() => onZoom('width')}>
				{t('Fit width')}
			</Button>
			<Button variant="link" aria-pressed={zoom === 'page'} onClick={() => onZoom('page')}>
				{t('Fit page')}
			</Button>
			<Button
				variant="link"
				icon={<IcZoomOut />}
				title={t('Zoom out')}
				aria-label={t('Zoom out')}
				onClick={() => onZoom(zoomOut)}
			/>
			<span className="pagillo-zoom-pct">{zoomPct}%</span>
			<Button
				variant="link"
				icon={<IcZoomIn />}
				title={t('Zoom in')}
				aria-label={t('Zoom in')}
				onClick={() => onZoom(zoomIn)}
			/>
		</div>
	)
}

// vim: ts=4
