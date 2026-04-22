// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { usePointerDrag } from '../hooks/usePointerDrag.js'
import type { CalendarEvent, EventPatch } from '../types.js'
import {
	addDaysIso,
	dayjs,
	formatDuration,
	formatHourLabel,
	formatMinutes,
	localDatePart,
	minutesOfDay,
	sameDay,
	toIsoDateTime
} from '../utils/dates.js'
import { type Interval, type PlacedInterval, placeIntervals } from '../utils/layout.js'
import { CurrentTimeIndicator } from './CurrentTimeIndicator.js'
import { TimeGridEvent } from './TimeGridEvent.js'

export interface TimeGridProps {
	days: string[]
	dayStartHour: number
	dayEndHour: number
	snapMinutes: number
	events: CalendarEvent[]
	selectedId?: string
	locale: string
	workingHours?: { start: number; end: number }
	workingDays?: readonly number[]
	onSelect?: (id: string) => void
	onCreateAt?: (start: string, end: string, allDay: boolean) => void
	onEventUpdate?: (patch: EventPatch) => void | Promise<void>
}

interface DragCtx {
	id: string
	mode: 'move' | 'resize'
	origStartMin: number // original start minutes since midnight
	origEndMin: number // original end minutes since midnight
	origDayIdx: number
	origDate: string // YYYY-MM-DD of the original start
	/** Full ISO start of the primary chip before dragging — used as the delta
	 *  anchor when shifting sibling chips in series / following scopes. */
	origStartIso: string
	slotPxHeight: number
	colPxWidth: number
	/** When set, the primary chip belongs to a recurring series; sibling chips
	 *  with the same `seriesId` may shift together depending on scope. */
	seriesId?: string
	/** Set when the primary chip IS the series anchor (its RECURRENCE-ID equals
	 *  the master's DTSTART). Dragging it re-anchors the whole series, so the
	 *  preview always shifts every sibling regardless of modifier key. */
	isSeriesAnchor: boolean
}

type DragScope = 'occurrence' | 'following' | 'series'

/** One entry per chip whose live position is being previewed during a drag. */
type PreviewMap = ReadonlyMap<string, { start: string; end: string; allDay: boolean }>

function pickScope(e: { shiftKey: boolean; altKey: boolean }): DragScope {
	if (e.altKey) return 'series'
	if (e.shiftKey) return 'following'
	return 'occurrence'
}

interface CreateCtx {
	day: string
	rect: DOMRect
	startMin: number
}

/** Day / week shared core — gutter + N day columns with drag and resize. */
export function TimeGrid({
	days,
	dayStartHour,
	dayEndHour,
	snapMinutes,
	events,
	selectedId,
	locale,
	workingHours,
	workingDays,
	onSelect,
	onCreateAt,
	onEventUpdate
}: TimeGridProps) {
	const dayStartMin = dayStartHour * 60
	const dayEndMin = dayEndHour * 60
	const dayLen = dayEndMin - dayStartMin
	const hours = React.useMemo(
		() => Array.from({ length: dayEndHour - dayStartHour }, (_, i) => dayStartHour + i),
		[dayStartHour, dayEndHour]
	)
	const slotsPerHour = 60 / snapMinutes
	const dayLabelFmt = React.useMemo(
		() => new Intl.DateTimeFormat(locale, { dateStyle: 'full' }),
		[locale]
	)

	const gridRef = React.useRef<HTMLDivElement>(null)
	// Preview state during an in-flight drag. A map so that "following" and
	// "series" scopes can shift sibling chips together with the primary — one
	// entry per chip whose rendered position should differ from its committed
	// one. A non-recurring or "this only" drag holds a single entry.
	const [preview, setPreview] = React.useState<PreviewMap | null>(null)
	// Pointer-move fires at the display refresh rate, but the placements memo
	// recomputes every time `preview` changes. Coalesce updates via rAF so we
	// re-render at most once per frame.
	const previewRafRef = React.useRef<number | null>(null)
	const pendingPreviewRef = React.useRef<PreviewMap | null | undefined>(undefined)
	const schedulePreview = React.useCallback((next: PreviewMap | null) => {
		pendingPreviewRef.current = next
		if (previewRafRef.current != null) return
		previewRafRef.current = requestAnimationFrame(() => {
			previewRafRef.current = null
			if (pendingPreviewRef.current !== undefined) {
				setPreview(pendingPreviewRef.current)
				pendingPreviewRef.current = undefined
			}
		})
	}, [])
	const setPreviewImmediate = React.useCallback((next: PreviewMap | null) => {
		if (previewRafRef.current != null) {
			cancelAnimationFrame(previewRafRef.current)
			previewRafRef.current = null
		}
		pendingPreviewRef.current = undefined
		setPreview(next)
	}, [])
	React.useEffect(
		() => () => {
			if (previewRafRef.current != null) cancelAnimationFrame(previewRafRef.current)
		},
		[]
	)
	// Touch-tap window listeners live outside React, so unmount has to tear
	// them down manually — otherwise a finger held through a route change
	// keeps firing `onCreateAt` on a dead parent.
	const touchTapCleanupRef = React.useRef<(() => void) | null>(null)
	React.useEffect(
		() => () => {
			touchTapCleanupRef.current?.()
			touchTapCleanupRef.current = null
		},
		[]
	)
	// Latched when a drag actually crossed the threshold, so the browser-
	// synthesized `click` that follows `pointerup` can be swallowed instead
	// of opening the details drawer (and kicking off a spurious getObject).
	const dragSuppressClickRef = React.useRef(false)
	// Hovered empty slot — drives the ghost "create here" rectangle.
	// Suppressed during a drag so it doesn't fight with the preview chip.
	const [hoverSlot, setHoverSlot] = React.useState<{
		day: string
		minutes: number
	} | null>(null)
	// Active drag-to-create range. startMin is the slot the pointer went down
	// on; endMin follows the cursor. Null when no create drag is in flight.
	const [createDraft, setCreateDraft] = React.useState<{
		day: string
		startMin: number
		endMin: number
	} | null>(null)

	// --- Drag / resize -------------------------------------------------

	/** True when `ev` is a sibling of the dragged chip and should shift under
	 *  the current scope. First-slot drags promote every sibling, because
	 *  CalendarApp re-anchors the master and all occurrences slide together. */
	const shouldShiftSibling = (ev: CalendarEvent, ctx: DragCtx, scope: DragScope): boolean => {
		if (!ctx.seriesId || ev.seriesId !== ctx.seriesId) return false
		if (ctx.isSeriesAnchor) return true
		if (scope === 'series') return true
		if (scope === 'following') {
			// Use the same millisecond comparison pattern as isMasterAnchor in the
			// consumer: tolerant of ISO format jitter (Z vs .000Z).
			const ev0 = dayjs(ev.start)
			const anchor = dayjs(ctx.origStartIso)
			return ev0.isValid() && anchor.isValid() && ev0.valueOf() >= anchor.valueOf()
		}
		return false
	}

	const computeTarget = (ctx: DragCtx, dx: number, dy: number): EventPatch => {
		const durationMin = ctx.origEndMin - ctx.origStartMin
		// slotPxHeight is the pixel height of one snap-interval slot; divide dy by
		// it to get number of slots dragged, then multiply by snapMinutes to get
		// minutes. (The earlier formula double-counted snapMinutes and sent end
		// times to the bottom of the day.)
		const dyMin = Math.round(dy / ctx.slotPxHeight) * snapMinutes
		const dxDays = Math.round(dx / ctx.colPxWidth)
		if (ctx.mode === 'resize') {
			// Only the end moves.
			const newEnd = Math.max(
				ctx.origStartMin + snapMinutes,
				Math.min(dayEndMin, ctx.origEndMin + dyMin)
			)
			return {
				id: ctx.id,
				start: toIsoDateTime(ctx.origDate, ctx.origStartMin),
				end: toIsoDateTime(ctx.origDate, newEnd),
				allDay: false
			}
		}
		// Move: both start and end shift by dyMin; day column shifts by dxDays.
		const targetDayIdx = Math.max(0, Math.min(days.length - 1, ctx.origDayIdx + dxDays))
		const dayOffset = targetDayIdx - ctx.origDayIdx
		const targetDate = addDaysIso(ctx.origDate, dayOffset)
		const maxShift = dayEndMin - durationMin - ctx.origStartMin
		const minShift = dayStartMin - ctx.origStartMin
		const clampedShift = Math.max(minShift, Math.min(maxShift, dyMin))
		const newStart = ctx.origStartMin + clampedShift
		const newEnd = newStart + durationMin
		return {
			id: ctx.id,
			start: toIsoDateTime(targetDate, newStart),
			end: toIsoDateTime(targetDate, newEnd),
			allDay: false
		}
	}

	/** Build the live preview map: always contains the primary's target, plus
	 *  one shifted entry per affected sibling under the current scope. Siblings
	 *  translate by the same WALL-CLOCK delta as the primary (day + minute).
	 *  Raw-ms math would off-by-one-hour any sibling whose target lands on the
	 *  other side of a DST boundary. Resize is scoped to the primary only —
	 *  resizing "everything" doesn't have an obvious meaning. */
	const computePreviewMap = (
		ctx: DragCtx,
		dx: number,
		dy: number,
		scope: DragScope
	): PreviewMap => {
		const primary = computeTarget(ctx, dx, dy)
		const map = new Map<string, { start: string; end: string; allDay: boolean }>()
		map.set(primary.id, { start: primary.start, end: primary.end, allDay: primary.allDay })
		if (ctx.mode === 'resize' || !ctx.seriesId) return map
		const origDate = localDatePart(ctx.origStartIso)
		const targetDate = localDatePart(primary.start)
		const dayDelta = dayjs(targetDate).diff(dayjs(origDate), 'day')
		const minuteDelta = minutesOfDay(primary.start) - minutesOfDay(ctx.origStartIso)
		if (dayDelta === 0 && minuteDelta === 0) return map
		for (const ev of events) {
			if (ev.id === primary.id) continue
			if (!shouldShiftSibling(ev, ctx, scope)) continue
			const shiftedStart = dayjs(ev.start).add(dayDelta, 'day').add(minuteDelta, 'minute')
			const shiftedEnd = dayjs(ev.end).add(dayDelta, 'day').add(minuteDelta, 'minute')
			if (!shiftedStart.isValid() || !shiftedEnd.isValid()) continue
			map.set(ev.id, {
				start: shiftedStart.toISOString(),
				end: shiftedEnd.toISOString(),
				allDay: ev.allDay
			})
		}
		return map
	}

	const drag = usePointerDrag<DragCtx>({
		onStart(e) {
			if (!onEventUpdate) return null
			const targetEl = e.currentTarget as HTMLElement
			const isResize = targetEl.classList.contains('c-cal-event__resize-handle')
			const eventEl = isResize
				? (targetEl.closest<HTMLElement>('.c-cal-event') ?? null)
				: targetEl
			if (!eventEl) return null
			const id = eventEl.dataset.eventId
			if (!id) return null
			const ev = events.find((x) => x.id === id)
			if (!ev || ev.allDay) return null
			if (!gridRef.current) return null
			const gridRect = gridRef.current.getBoundingClientRect()
			// Day column width = (grid width - gutter) / N.
			// Prefer the gutter element's measured width (handles responsive
			// `--cal-gutter-width` breakpoints); fall back to parsing the
			// resolved grid-template-columns, then to zero so math stays finite.
			const gutterEl = gridRef.current.querySelector<HTMLElement>('.c-cal-view__gutter')
			let gutterPx = gutterEl?.getBoundingClientRect().width ?? 0
			if (!Number.isFinite(gutterPx) || gutterPx <= 0) {
				const gutterStyle = window
					.getComputedStyle(gridRef.current)
					.getPropertyValue('grid-template-columns')
					.trim()
				const firstCol = Number.parseFloat(gutterStyle.split(' ')[0])
				gutterPx = Number.isFinite(firstCol) ? firstCol : 0
			}
			if (dayLen <= 0) return null
			const colPxWidth = (gridRect.width - gutterPx) / days.length
			// Measure an actual slot element so responsive `--cal-hour-height`
			// overrides (or any row padding/border) don't skew drag snapping.
			const slotEl = gridRef.current.querySelector<HTMLElement>('.c-cal-view__slot')
			const measuredSlotPx = slotEl?.getBoundingClientRect().height ?? 0
			const slotPxHeight =
				Number.isFinite(measuredSlotPx) && measuredSlotPx > 0
					? measuredSlotPx
					: gridRect.height / (dayLen / snapMinutes)
			const origDate = localDatePart(ev.start)
			const origStartMin = minutesOfDay(ev.start)
			const origEndMin = minutesOfDay(ev.end)
			const origDayIdx = days.indexOf(origDate)
			if (origDayIdx === -1) return null
			e.preventDefault()
			return {
				id: ev.id,
				mode: isResize ? 'resize' : 'move',
				origStartMin,
				origEndMin,
				origDayIdx,
				origDate,
				origStartIso: ev.start,
				slotPxHeight,
				colPxWidth,
				seriesId: ev.seriesId,
				isSeriesAnchor: !!ev.isSeriesAnchor
			}
		},
		onMove(e, ctx, { dx, dy }) {
			schedulePreview(computePreviewMap(ctx, dx, dy, pickScope(e)))
		},
		onEnd(e, ctx, { dx, dy }, wasDrag) {
			if (!wasDrag) {
				setPreviewImmediate(null)
				return
			}
			dragSuppressClickRef.current = true
			// Click dispatches synchronously after pointerup within the same
			// task; this timeout lands after the handler has run, and also
			// cleans up if the browser chose not to fire one (pointer moved
			// too far).
			setTimeout(() => {
				dragSuppressClickRef.current = false
			}, 0)
			const target = computeTarget(ctx, dx, dy)
			// Modifier keys at pointerup pick the series scope:
			// • Alt/Option  → whole series
			// • Shift       → this and following
			// • no modifier → this occurrence only (default; safest blast radius)
			// Consumers only route on `scope` when the occurrence is recurring.
			target.scope = pickScope(e)
			// Hold the preview set — the useEffect below clears it once the
			// `events` prop reflects the new time (success) or after a grace
			// period (failed update / refresh). Clearing here would snap the
			// chip back to its pre-drag position during the server round-trip.
			Promise.resolve(onEventUpdate?.(target)).catch(() => {})
		}
	})

	// --- Drag-to-create ------------------------------------------------

	function minutesFromPointer(e: PointerEvent | React.PointerEvent, rect: DOMRect): number {
		const relY = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
		const abs = (relY / rect.height) * dayLen + dayStartMin
		return Math.round(abs / snapMinutes) * snapMinutes
	}

	const createDrag = usePointerDrag<CreateCtx>({
		onStart(e) {
			if (!onCreateAt) return null
			if (e.pointerType === 'touch') return null
			if (e.button !== 0) return null
			// Don't steal presses on existing event chips / resize handles.
			const target = e.target as HTMLElement
			if (target.closest('.c-cal-event')) return null
			const dayColEl = e.currentTarget as HTMLElement
			const day = dayColEl.dataset.day
			if (!day) return null
			const rect = dayColEl.getBoundingClientRect()
			if (rect.height <= 0) return null
			// Use Math.round — matches `minutesFromPointer` above — so the click
			// point snaps to the nearest boundary rather than the one below it.
			const startMin = minutesFromPointer(e, rect)
			setCreateDraft({ day, startMin, endMin: startMin + snapMinutes })
			e.preventDefault()
			return { day, rect, startMin }
		},
		onMove(e, ctx) {
			setCreateDraft({
				day: ctx.day,
				startMin: ctx.startMin,
				endMin: minutesFromPointer(e, ctx.rect)
			})
		},
		onEnd(e, ctx, _delta, wasDrag) {
			setCreateDraft(null)
			if (wasDrag) {
				const snapped = minutesFromPointer(e, ctx.rect)
				const rawStart = Math.min(ctx.startMin, snapped)
				const rawEnd = Math.max(ctx.startMin, snapped)
				const end = Math.max(rawEnd, rawStart + snapMinutes)
				onCreateAt?.(toIsoDateTime(ctx.day, rawStart), toIsoDateTime(ctx.day, end), false)
			} else {
				// Pure click on an empty slot → 1h default at the pressed slot.
				// `preventDefault` on pointerdown swallows the browser's synthesized
				// click, so we fire `onCreateAt` ourselves here instead of relying
				// on the slot button's onClick.
				onCreateAt?.(
					toIsoDateTime(ctx.day, ctx.startMin),
					toIsoDateTime(ctx.day, ctx.startMin + 60),
					false
				)
			}
		}
	})

	/** Tap-to-create for touch. Doesn't capture the pointer so the browser
	 *  can still take over for a vertical scroll — we only fire onCreateAt
	 *  if the finger never moved more than a small tolerance. */
	function handleTouchTap(e: React.PointerEvent<HTMLDivElement>, day: string) {
		if (!onCreateAt) return
		const target = e.target as HTMLElement
		if (target.closest('.c-cal-event')) return
		const rect = e.currentTarget.getBoundingClientRect()
		if (rect.height <= 0) return
		const startMin =
			Math.floor(
				((Math.max(0, Math.min(rect.height, e.clientY - rect.top)) / rect.height) * dayLen +
					dayStartMin) /
					snapMinutes
			) * snapMinutes
		const startX = e.clientX
		const startY = e.clientY
		const pointerId = e.pointerId
		// An earlier tap that never saw a `pointerup` (finger still down across
		// a rerender) leaves listeners behind — clear any stale cleanup first.
		touchTapCleanupRef.current?.()
		const cleanup = () => {
			window.removeEventListener('pointerup', onUp)
			window.removeEventListener('pointercancel', onCancel)
			if (touchTapCleanupRef.current === cleanup) touchTapCleanupRef.current = null
		}
		const onUp = (ev: PointerEvent) => {
			if (ev.pointerId !== pointerId) return
			cleanup()
			// Touch pointers need a looser tap tolerance than mouse — fingers
			// drift more than cursors do on a release.
			if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) return
			onCreateAt(toIsoDateTime(day, startMin), toIsoDateTime(day, startMin + 60), false)
		}
		const onCancel = (ev: PointerEvent) => {
			if (ev.pointerId !== pointerId) return
			cleanup()
		}
		window.addEventListener('pointerup', onUp)
		window.addEventListener('pointercancel', onCancel)
		touchTapCleanupRef.current = cleanup
	}

	// --- Layout --------------------------------------------------------

	const placements = React.useMemo(() => {
		const byDay = new Map<string, Interval<CalendarEvent>[]>(days.map((d) => [d, []]))
		for (const ev of events) {
			if (ev.allDay) continue
			// Substitute the preview coords for any chip whose position is being
			// previewed (primary + shifted siblings).
			const pv = preview?.get(ev.id)
			const useStart = pv ? pv.start : ev.start
			const useEnd = pv ? pv.end : ev.end
			const startDate = localDatePart(useStart)
			const endDate = localDatePart(useEnd)
			for (const [day, ivs] of byDay) {
				if (startDate > day) continue
				if (endDate < day) continue
				const startMin = startDate === day ? minutesOfDay(useStart) : 0
				const endMin = endDate === day ? minutesOfDay(useEnd) : 24 * 60
				const clippedStart = Math.max(startMin, dayStartMin)
				const clippedEnd = Math.min(endMin, dayEndMin)
				if (clippedEnd <= clippedStart) continue
				ivs.push({ start: clippedStart, end: clippedEnd, item: ev })
			}
		}
		const out = new Map<string, PlacedInterval<CalendarEvent>[]>()
		for (const [day, ivs] of byDay) out.set(day, placeIntervals(ivs))
		return out
	}, [events, days, dayStartMin, dayEndMin, preview])

	const handleEventSelect = React.useCallback(
		(id: string) => {
			if (dragSuppressClickRef.current) {
				dragSuppressClickRef.current = false
				return
			}
			onSelect?.(id)
		},
		[onSelect]
	)

	// Clear the drag preview once `events` reflects every previewed chip —
	// prevents them from snapping back during the PUT round-trip. A grace-period
	// fallback handles the case where the server rejects an update and events
	// stay unchanged.
	React.useEffect(() => {
		if (!preview) return
		const byId = new Map(events.map((e) => [e.id, e]))
		let allMatch = true
		for (const [id, pv] of preview) {
			const ev = byId.get(id)
			// Chip gone (e.g., deleted) — consider it resolved.
			if (!ev) continue
			if (ev.start !== pv.start || ev.end !== pv.end) {
				allMatch = false
				break
			}
		}
		if (allMatch) {
			setPreviewImmediate(null)
			return
		}
		const timer = setTimeout(() => setPreviewImmediate(null), 2000)
		return () => clearTimeout(timer)
	}, [events, preview, setPreviewImmediate])

	const today = dayjs().format('YYYY-MM-DD')

	return (
		<div
			ref={gridRef}
			className="c-cal-view__timegrid"
			style={
				{
					'--hours': hours.length,
					'--cols': days.length
				} as React.CSSProperties
			}
		>
			<div className="c-cal-view__gutter">
				{hours.map((h) => (
					<div key={h} className="c-cal-view__hour-label">
						{formatHourLabel(h)}
					</div>
				))}
			</div>
			{days.map((day) => {
				const placed = placements.get(day) ?? []
				const isToday = sameDay(day, today)
				const dow = dayjs(day).day()
				const isNonWorking = !!workingDays && !workingDays.includes(dow)
				const showHover = !preview && !createDraft && hoverSlot?.day === day
				const hoverTop = showHover ? ((hoverSlot.minutes - dayStartMin) / dayLen) * 100 : 0
				const draftForDay = createDraft?.day === day ? createDraft : null
				const draftMin = draftForDay
					? Math.min(draftForDay.startMin, draftForDay.endMin)
					: 0
				const draftMaxRaw = draftForDay
					? Math.max(draftForDay.startMin, draftForDay.endMin)
					: 0
				const draftMax = draftForDay ? Math.max(draftMaxRaw, draftMin + snapMinutes) : 0
				// Non-working hour bands — rendered only on working days so we
				// don't double-dim. Clamp to the visible dayStart..dayEnd range.
				let preBandHeight = 0
				let postBandTop = 100
				let postBandHeight = 0
				if (workingHours && !isNonWorking) {
					const wStart = Math.max(dayStartHour, workingHours.start) * 60
					const wEnd = Math.min(dayEndHour, workingHours.end) * 60
					if (wStart > dayStartMin) {
						preBandHeight = ((wStart - dayStartMin) / dayLen) * 100
					}
					if (wEnd < dayEndMin) {
						postBandTop = ((wEnd - dayStartMin) / dayLen) * 100
						postBandHeight = 100 - postBandTop
					}
				}
				return (
					<div
						key={day}
						className={`c-cal-view__day-col${isToday ? ' is-today' : ''}${isNonWorking ? ' is-non-working' : ''}`}
						data-day={day}
						role="gridcell"
						tabIndex={onCreateAt ? 0 : -1}
						aria-label={dayLabelFmt.format(dayjs(day).toDate())}
						onPointerDown={(e) => {
							if (e.pointerType === 'touch') {
								handleTouchTap(e, day)
							} else {
								createDrag.onPointerDown(e)
							}
						}}
						onPointerMove={(e) => {
							if (preview || createDraft || e.pointerType === 'touch') return
							const rect = e.currentTarget.getBoundingClientRect()
							if (rect.height <= 0) return
							const relY = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
							const absMin = (relY / rect.height) * dayLen + dayStartMin
							const snapped = Math.floor(absMin / snapMinutes) * snapMinutes
							setHoverSlot((prev) => {
								if (prev?.day === day && prev.minutes === snapped) return prev
								return { day, minutes: snapped }
							})
						}}
						onPointerLeave={() => setHoverSlot(null)}
						onKeyDown={(e) => {
							// Keyboard entry for creating an event without a pointer. Enter
							// or Space opens a 1h event at the last-hovered slot if present,
							// otherwise at 9am (a sensible default for most calendars).
							if (!onCreateAt) return
							if (e.key !== 'Enter' && e.key !== ' ') return
							if (e.target !== e.currentTarget) return
							e.preventDefault()
							const startMin =
								hoverSlot?.day === day
									? hoverSlot.minutes
									: Math.max(dayStartMin, 9 * 60)
							const endMin = Math.min(dayEndMin, startMin + 60)
							onCreateAt(
								toIsoDateTime(day, startMin),
								toIsoDateTime(day, endMin),
								false
							)
						}}
					>
						{hours.map((h) => (
							<div key={h} className="c-cal-view__hour-row">
								{Array.from({ length: slotsPerHour }).map((_, s) => (
									<div key={s} className="c-cal-view__slot" aria-hidden="true" />
								))}
							</div>
						))}
						{preBandHeight > 0 && (
							<div
								className="c-cal-view__off-hours"
								style={{ top: 0, height: `${preBandHeight}%` }}
								aria-hidden="true"
							/>
						)}
						{postBandHeight > 0 && (
							<div
								className="c-cal-view__off-hours"
								style={{ top: `${postBandTop}%`, height: `${postBandHeight}%` }}
								aria-hidden="true"
							/>
						)}
						{isToday && (
							<CurrentTimeIndicator
								dayStartMinutes={dayStartMin}
								dayEndMinutes={dayEndMin}
							/>
						)}
						{showHover && (
							<div
								className="c-cal-hover-indicator"
								style={{ top: `${hoverTop}%` }}
								aria-hidden="true"
							>
								{formatMinutes(hoverSlot.minutes)}
							</div>
						)}
						{draftForDay && (
							<div
								className="c-cal-create-draft"
								style={{
									top: `${((draftMin - dayStartMin) / dayLen) * 100}%`,
									height: `${((draftMax - draftMin) / dayLen) * 100}%`
								}}
								aria-hidden="true"
							>
								<span className="c-cal-create-draft__start">
									{formatMinutes(draftMin)}
								</span>
								<span className="c-cal-create-draft__duration">
									{formatDuration(draftMax - draftMin)}
								</span>
								<span className="c-cal-create-draft__end">
									{formatMinutes(draftMax)}
								</span>
							</div>
						)}
						{placed.map(({ item: ev, lane, totalLanes }) => {
							const pv = preview?.get(ev.id)
							const isDragging = !!pv
							const useStart = pv ? pv.start : ev.start
							const useEnd = pv ? pv.end : ev.end
							const startDate = localDatePart(useStart)
							const endDate = localDatePart(useEnd)
							const startMin = startDate === day ? minutesOfDay(useStart) : 0
							const endMin = endDate === day ? minutesOfDay(useEnd) : 24 * 60
							const top =
								((Math.max(startMin, dayStartMin) - dayStartMin) / dayLen) * 100
							const bottom =
								((Math.min(endMin, dayEndMin) - dayStartMin) / dayLen) * 100
							// While dragging, feed the preview times into TimeGridEvent so the
							// time label and duration badge track the pointer live.
							const displayEvent = isDragging
								? { ...ev, start: useStart, end: useEnd }
								: ev
							return (
								<TimeGridEvent
									key={`${ev.id}-${day}`}
									event={displayEvent}
									top={top}
									height={Math.max(bottom - top, 1.5)}
									lane={lane}
									totalLanes={totalLanes}
									selected={selectedId === ev.id}
									dragging={isDragging}
									locale={locale}
									onSelect={handleEventSelect}
									onPointerDown={onEventUpdate ? drag.onPointerDown : undefined}
									onResizePointerDown={
										onEventUpdate ? drag.onPointerDown : undefined
									}
								/>
							)
						})}
					</div>
				)
			})}
		</div>
	)
}

// vim: ts=4
