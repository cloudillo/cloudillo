// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Fcd, Menu, MenuDivider, MenuItem, useIsMobile, useToast } from '@cloudillo/react'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcAdd,
	LuCheck as IcCheck,
	LuGhost as IcGhost,
	LuEllipsisVertical as IcMore,
	LuCalendarPlus as IcNewCal,
	LuPanelLeft as IcSidebar
} from 'react-icons/lu'
import '@cloudillo/react/components.css'
import type {
	CalendarCreate,
	CalendarObjectInput,
	CalendarObjectOutput,
	CalendarOutput,
	CalendarPatch
} from '@cloudillo/core'

import { useContextAwareApi } from '../../context/index.js'
import { useSettings } from '../../settings/settings.js'
import {
	currentDateAtom,
	searchQueryAtom,
	selectedObjectAtom,
	viewModeAtom,
	visibleCalendarsAtom
} from './atoms.js'
import {
	AgendaView,
	CalendarEditor,
	CalendarGrid,
	CalendarSidebar,
	CalendarToolbar,
	EventEditor,
	ObjectDetails,
	ObjectDetailsHeader,
	RecurringEditScopeDialog,
	TaskEditor,
	TaskList
} from './components/index.js'
import { useCalendars, useEventRange, useRecurringScopeOps, useTaskList } from './hooks/index.js'
import type { CalendarView } from './types.js'
import { calendarSupports } from './utils.js'

import './calendar.css'

export function CalendarApp() {
	const { t, i18n } = useTranslation()
	const { api } = useContextAwareApi()
	const toast = useToast()

	const [currentDate, setCurrentDate] = useAtom(currentDateAtom)
	const [view, setView] = useAtom(viewModeAtom)
	const [visibleCalendars, setVisibleCalendars] = useAtom(visibleCalendarsAtom)
	const [selectedRef, setSelectedRef] = useAtom(selectedObjectAtom)
	const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)

	// Server-persisted calendar prefs. `ui.calendar.week_start`: 0 = Sunday,
	// 1 = Monday. When unset (or anything else) the library falls back to
	// the locale default via `localeFirstDay`.
	const { settings: calendarSettings, setSettings: setCalendarSettings } =
		useSettings('ui.calendar')
	const weekStartRaw = calendarSettings?.['ui.calendar.week_start']
	const firstDayOfWeek: 0 | 1 | undefined =
		weekStartRaw === 0 || weekStartRaw === '0'
			? 0
			: weekStartRaw === 1 || weekStartRaw === '1'
				? 1
				: undefined

	// Working-hours overlay: defaults to 9-17 when unset or invalid.
	const workingHours = React.useMemo(() => {
		const rawStart = calendarSettings?.['ui.calendar.working_hours_start']
		const rawEnd = calendarSettings?.['ui.calendar.working_hours_end']
		const start = Number(rawStart ?? 9)
		const end = Number(rawEnd ?? 17)
		if (!Number.isFinite(start) || !Number.isFinite(end)) return { start: 9, end: 17 }
		if (start < 0 || end > 24 || start >= end) return { start: 9, end: 17 }
		return { start, end }
	}, [calendarSettings])

	// Working days stored as a comma-separated string of day-of-week indices
	// (0 = Sunday … 6 = Saturday). Defaults to Mon-Fri when unset.
	const workingDays = React.useMemo<readonly number[]>(() => {
		const raw = calendarSettings?.['ui.calendar.working_days']
		if (typeof raw !== 'string') return [1, 2, 3, 4, 5]
		const parsed = raw
			.split(',')
			.map((x) => Number(x.trim()))
			.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
		return parsed.length > 0 ? parsed : [1, 2, 3, 4, 5]
	}, [calendarSettings])

	// Optional "ghost" rendering of the original slot for moved recurring
	// occurrences. Off by default — reduces visual noise for users who don't
	// need the audit trail. Toggle lives in the toolbar "More" menu and the
	// calendar settings page.
	const showOverrideGhosts = React.useMemo(() => {
		const raw = calendarSettings?.['ui.calendar.show_override_ghosts']
		return raw === true || raw === 'true' || raw === 1 || raw === '1'
	}, [calendarSettings])

	const {
		calendars,
		isLoading: calsLoading,
		create: createCal,
		update: updateCal,
		remove: removeCal
	} = useCalendars()

	// Initialise visibility to all calendars on first load.
	React.useEffect(
		function initVisibility() {
			if (visibleCalendars === null && calendars.length > 0) {
				setVisibleCalendars(new Set(calendars.map((c) => c.calId)))
			}
		},
		[calendars, visibleCalendars, setVisibleCalendars]
	)

	const visibleCalList = React.useMemo(
		() => (visibleCalendars ? calendars.filter((c) => visibleCalendars.has(c.calId)) : []),
		[calendars, visibleCalendars]
	)

	const events = useEventRange({
		calendars: visibleCalList,
		currentDate,
		view,
		searchQuery,
		showOverrideGhosts
	})

	const tasks = useTaskList({
		calendars: visibleCalList,
		searchQuery
	})

	// Left sidebar visibility. On mobile it's overlay-only (initial closed); on
	// desktop it's a flex child that can be collapsed to give the grid the full
	// width. `useIsMobile` returns true below the md breakpoint.
	const isMobile = useIsMobile()
	const [sidebarOpen, setSidebarOpen] = React.useState(!isMobile)
	// Sync once when the viewport crosses the breakpoint; respect any manual
	// toggle the user has made since.
	const prevMobileRef = React.useRef(isMobile)
	React.useEffect(() => {
		if (prevMobileRef.current !== isMobile) {
			setSidebarOpen(!isMobile)
			prevMobileRef.current = isMobile
		}
	}, [isMobile])

	// Editors
	const [eventEditorOpen, setEventEditorOpen] = React.useState(false)
	const [editingEvent, setEditingEvent] = React.useState<CalendarObjectOutput | undefined>()
	const [eventDraft, setEventDraft] = React.useState<{
		start: string
		end: string
		allDay: boolean
	} | null>(null)
	const [taskEditorOpen, setTaskEditorOpen] = React.useState(false)
	const [editingTask, setEditingTask] = React.useState<CalendarObjectOutput | undefined>()
	const [calEditorOpen, setCalEditorOpen] = React.useState(false)
	const [editingCal, setEditingCal] = React.useState<CalendarOutput | undefined>()

	const [toolbarMenu, setToolbarMenu] = React.useState<{ x: number; y: number } | null>(null)

	function openToolbarMenu(e: React.MouseEvent<HTMLButtonElement>) {
		const rect = e.currentTarget.getBoundingClientRect()
		const MENU_WIDTH = 220
		const x = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
		setToolbarMenu({ x, y: rect.bottom + 4 })
	}

	// Loaded full object (for details pane and editor)
	const [detailObject, setDetailObject] = React.useState<CalendarObjectOutput | undefined>()
	const [detailLoading, setDetailLoading] = React.useState(false)
	// Whether the currently selected recurring occurrence is backed by an
	// override row — drives the "Reset" affordance in the details pane.
	const [detailHasOverride, setDetailHasOverride] = React.useState(false)

	// Recurring save/delete/drag are routed through a scope prompt so the user
	// picks "this only" / "this and following" / "all". The hook owns the
	// scopePrompt state, the PATCH sequences, and the optimistic drag/resize
	// commit (including rollback on failure).
	const { scopePrompt, openPrompt, handleScopeChoose, handleScopeCancel, handleEventUpdate } =
		useRecurringScopeOps({
			api,
			events,
			selectedRef,
			setSelectedRef,
			setDetailObject
		})

	// Pin to the primitive fields of selectedRef so that callers passing a
	// fresh `{...selectedRef}` (same content, new identity) don't trigger a
	// re-fetch loop. The object reference can churn whenever Jotai re-renders
	// downstream consumers.
	const selCalId = selectedRef?.calId
	const selUid = selectedRef?.uid
	const selOccStart = selectedRef?.occurrenceStart
	const selHasOverride = selectedRef?.hasOverride ?? false
	React.useEffect(
		function loadSelected() {
			if (!api || selCalId == null || !selUid) {
				setDetailObject(undefined)
				setDetailHasOverride(false)
				return
			}
			let cancelled = false
			setDetailLoading(true)
			const occStart = selOccStart
			Promise.all([
				api.calendars.getObject(selCalId, selUid),
				// listObjects already told us (via `hasOverride` on the occurrence)
				// whether this slot has an override row. Only round-trip to fetch
				// the override payload when one actually exists, instead of probing
				// every unmodified recurring instance with a request that 404s.
				occStart && selHasOverride
					? api.calendars.getException(selCalId, selUid, occStart).catch(() => null)
					: Promise.resolve(null)
			])
				.then(([master, override]) => {
					if (cancelled) return
					setDetailHasOverride(!!override)
					if (occStart && master.rrule) {
						// Recurring: show the clicked occurrence's date/time, overlaid with
						// any override fields. The master stays authoritative for RRULE/UID.
						const masterStart = master.dtstart ? dayjs(master.dtstart) : null
						const masterEnd = master.dtend ? dayjs(master.dtend) : null
						const durationMs =
							masterStart && masterEnd
								? masterEnd.valueOf() - masterStart.valueOf()
								: 3600_000
						const baseStart = dayjs(override?.dtstart ?? occStart)
						const baseEnd = override?.dtend
							? dayjs(override.dtend)
							: baseStart.add(durationMs, 'millisecond')
						setDetailObject({
							...master,
							summary: override?.summary ?? master.summary,
							location: override?.location ?? master.location,
							description: override?.description ?? master.description,
							status: override?.status ?? master.status,
							allDay: override?.allDay ?? master.allDay,
							dtstart: baseStart.toISOString(),
							dtend: baseEnd.toISOString()
						})
					} else {
						setDetailObject(master)
					}
				})
				.catch((err) => {
					if (cancelled) return
					setDetailObject(undefined)
					toast.error(err instanceof Error ? err.message : t('Failed to load event'))
				})
				.finally(() => {
					if (!cancelled) setDetailLoading(false)
				})
			return () => {
				cancelled = true
			}
		},
		// `t` and `toast` are intentionally omitted: `useToast()` returns a new
		// wrapper object on every render, which would re-fire the fetch in a
		// loop. Both are only used inside the async error path, where capturing
		// the wrapper as it was at effect-mount time is fine.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[api, selCalId, selUid, selOccStart, selHasOverride]
	)

	function handleToggleCalendar(calId: number) {
		setVisibleCalendars((prev) => {
			const next = new Set(prev ?? calendars.map((c) => c.calId))
			if (next.has(calId)) next.delete(calId)
			else next.add(calId)
			return next
		})
	}

	function openCreateCalendar() {
		setEditingCal(undefined)
		setCalEditorOpen(true)
	}

	function openEditCalendar(cal: CalendarOutput) {
		setEditingCal(cal)
		setCalEditorOpen(true)
	}

	async function handleSaveCalendar(data: CalendarCreate | CalendarPatch) {
		if (editingCal) {
			await updateCal(editingCal.calId, data as CalendarPatch)
			toast.success(t('Calendar updated'))
		} else {
			const created = await createCal(data as CalendarCreate)
			if (created) {
				setVisibleCalendars((prev) => {
					const next = new Set(prev ?? [])
					next.add(created.calId)
					return next
				})
			}
			toast.success(t('Calendar created'))
		}
	}

	async function handleDeleteCalendar(cal: CalendarOutput) {
		await removeCal(cal.calId)
		setVisibleCalendars((prev) => {
			if (!prev) return prev
			const next = new Set(prev)
			next.delete(cal.calId)
			return next
		})
		if (selectedRef?.calId === cal.calId) setSelectedRef(null)
		toast.success(t('Calendar deleted'))
	}

	function openCreateEvent() {
		setEditingEvent(undefined)
		setEventEditorOpen(true)
	}

	function openEditEvent() {
		if (!detailObject) return
		if (detailObject.component === 'VTODO') {
			setEditingTask(detailObject)
			setTaskEditorOpen(true)
		} else {
			// For a recurring event, the master's dtstart/dtend point at the first occurrence.
			// Seed the editor with the clicked occurrence's date instead so "this event only"
			// and "this and following" edits carry the right anchor.
			const rid = selectedRef?.occurrenceStart
			if (detailObject.rrule && rid) {
				const masterStart = detailObject.dtstart ? dayjs(detailObject.dtstart).valueOf() : 0
				const masterEnd = detailObject.dtend ? dayjs(detailObject.dtend).valueOf() : 0
				const durationMs = masterEnd > masterStart ? masterEnd - masterStart : 3600_000
				const occStart = dayjs(rid)
				const occEnd = occStart.add(durationMs, 'millisecond')
				setEditingEvent({
					...detailObject,
					dtstart: occStart.toISOString(),
					dtend: occEnd.toISOString()
				})
			} else {
				setEditingEvent(detailObject)
			}
			setEventEditorOpen(true)
		}
	}

	function openCreateTask() {
		setEditingTask(undefined)
		setTaskEditorOpen(true)
	}

	async function handleSaveEvent(calId: number, data: CalendarObjectInput) {
		if (!api) throw new Error(t('Not connected'))
		if (editingEvent) {
			// Recurring series + the user clicked a specific occurrence → prompt for scope.
			const rid = selectedRef?.occurrenceStart
			if (editingEvent.rrule && rid) {
				openPrompt({
					kind: 'save',
					occurrenceStart: rid,
					calId: editingEvent.calId,
					uid: editingEvent.uid,
					data
				})
				return
			}
			const updated = await api.calendars.replaceObject(
				editingEvent.calId,
				editingEvent.uid,
				data
			)
			setDetailObject(updated)
			toast.success(t('Event updated'))
		} else {
			const created = await api.calendars.createObject(calId, data)
			setSelectedRef({ calId: created.calId, uid: created.uid })
			toast.success(t('Event created'))
		}
		events.refresh()
	}

	async function handleSaveTask(calId: number, data: CalendarObjectInput) {
		if (!api) throw new Error(t('Not connected'))
		if (editingTask) {
			const updated = await api.calendars.replaceObject(
				editingTask.calId,
				editingTask.uid,
				data
			)
			setDetailObject(updated)
			toast.success(t('Task updated'))
		} else {
			const created = await api.calendars.createObject(calId, data)
			setSelectedRef({ calId: created.calId, uid: created.uid })
			toast.success(t('Task created'))
		}
		tasks.refresh()
	}

	async function handleDeleteObject() {
		if (!detailObject || !api) return
		const rid = selectedRef?.occurrenceStart
		if (detailObject.rrule && rid && detailObject.component === 'VEVENT') {
			openPrompt({
				kind: 'delete',
				occurrenceStart: rid,
				calId: detailObject.calId,
				uid: detailObject.uid
			})
			return
		}
		try {
			await api.calendars.deleteObject(detailObject.calId, detailObject.uid)
			setSelectedRef(null)
			setDetailObject(undefined)
			events.refresh()
			tasks.refresh()
			toast.success(t('Deleted'))
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('Failed to delete'))
		}
	}

	async function handleResetOverride() {
		if (!api || !detailObject || !selectedRef?.occurrenceStart) return
		try {
			await api.calendars.deleteException(
				detailObject.calId,
				detailObject.uid,
				selectedRef.occurrenceStart
			)
			toast.success(t('Reset to series default'))
			// Reload the detail pane so it now reflects the master's values at
			// this occurrence date. After deleting the exception, the slot no
			// longer has an override row, so flip `hasOverride` off too.
			setSelectedRef({ ...selectedRef, hasOverride: false })
			events.refresh()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('Reset failed'))
		}
	}

	/** Toggle VTODO completion status with one click from the task row. */
	async function handleToggleTaskComplete(obj: CalendarObjectOutput) {
		if (!api) return
		const complete = obj.status !== 'COMPLETED'
		try {
			await api.calendars.replaceObject(obj.calId, obj.uid, {
				todo: {
					summary: obj.summary,
					description: obj.description,
					dtstart: obj.dtstart,
					due: obj.dtend,
					completed: complete ? dayjs().toISOString() : undefined,
					status: complete ? 'COMPLETED' : 'NEEDS-ACTION',
					priority: obj.priority,
					rrule: obj.rrule
				}
			})
			if (selectedRef?.uid === obj.uid) {
				const reloaded = await api.calendars.getObject(obj.calId, obj.uid)
				// A routing/id-collision bug could hand us back the wrong object
				// type — refuse to show a VEVENT in the VTODO detail pane.
				if (reloaded.component === 'VTODO') {
					setDetailObject(reloaded)
				}
			}
			tasks.refresh()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('Failed to update task'))
			tasks.refresh()
		}
	}

	const noCalendars = !calsLoading && calendars.length === 0
	const eventCalendars = calendars.filter((c) => calendarSupports(c.components, 'VEVENT'))
	const taskCalendars = calendars.filter((c) => calendarSupports(c.components, 'VTODO'))
	const defaultCalId = calendars[0]?.calId

	const handleViewChange = React.useCallback(
		function handleViewChange(v: CalendarView) {
			setView(v)
			// Tasks view needs task-capable calendars visible — leave visibility as-is
			// (users can toggle per-calendar from the sidebar).
		},
		[setView]
	)

	return (
		<>
			<Fcd.Container fluid detailsMode="overlay" className="c-cal-app">
				<Fcd.Filter
					className={`c-cal-app__filter${sidebarOpen ? '' : ' collapsed'}`}
					isVisible={sidebarOpen}
					hide={() => setSidebarOpen(false)}
				>
					<CalendarSidebar
						calendars={calendars}
						visible={visibleCalendars}
						currentDate={currentDate}
						onToggle={handleToggleCalendar}
						onEdit={openEditCalendar}
						onDelete={handleDeleteCalendar}
						onCreate={openCreateCalendar}
						onPickDate={setCurrentDate}
					/>
				</Fcd.Filter>

				<Fcd.Content
					className="c-cal-app__content"
					header={
						<CalendarToolbar
							currentDate={currentDate}
							view={view}
							searchQuery={searchQuery}
							onDateChange={setCurrentDate}
							onViewChange={handleViewChange}
							onSearchChange={setSearchQuery}
							lead={
								<button
									type="button"
									className="c-link"
									onClick={() => setSidebarOpen((v) => !v)}
									aria-label={t('Toggle calendars')}
									aria-pressed={sidebarOpen}
									title={t('Toggle calendars')}
								>
									<IcSidebar />
								</button>
							}
							trail={
								<div className="d-flex align-items-center g-1">
									<Button
										variant="primary"
										size="small"
										disabled={noCalendars}
										onClick={
											view === 'tasks' ? openCreateTask : openCreateEvent
										}
										icon={<IcAdd />}
									>
										{view === 'tasks' ? t('New task') : t('New event')}
									</Button>
									<button
										type="button"
										className="c-link"
										onClick={openToolbarMenu}
										aria-label={t('More actions')}
										aria-haspopup="menu"
										aria-expanded={!!toolbarMenu}
										title={t('More actions')}
									>
										<IcMore />
									</button>
								</div>
							}
						/>
					}
				>
					{noCalendars ? (
						<div className="c-vbox align-items-center justify-content-center p-4 g-3 text-center flex-fill">
							<h3 className="m-0">{t('No calendars yet')}</h3>
							<p className="c-hint">
								{t('Create a calendar to start adding events and tasks.')}
							</p>
							<Button variant="primary" onClick={openCreateCalendar}>
								<IcNewCal className="me-1" />
								{t('New calendar')}
							</Button>
						</div>
					) : view === 'tasks' ? (
						<TaskList
							tasks={tasks.objects}
							calendars={calendars}
							isLoading={tasks.isLoading}
							hasMore={tasks.hasMore}
							error={tasks.error}
							loadMore={tasks.loadMore}
							sentinelRef={tasks.sentinelRef}
							onToggleComplete={handleToggleTaskComplete}
						/>
					) : view === 'agenda' ? (
						<AgendaView
							occurrences={events.occurrences}
							calendars={calendars}
							isLoading={events.isLoading}
						/>
					) : (
						<CalendarGrid
							view={view}
							currentDate={currentDate}
							occurrences={events.occurrences}
							calendars={calendars}
							firstDayOfWeek={firstDayOfWeek}
							workingHours={workingHours}
							workingDays={workingDays}
							onDateChange={setCurrentDate}
							onCreateAt={(start, end, allDay) => {
								setEditingEvent(undefined)
								setEventEditorOpen(true)
								setEventDraft({ start, end, allDay })
							}}
							onEventUpdate={handleEventUpdate}
							onViewChange={handleViewChange}
						/>
					)}
				</Fcd.Content>

				<Fcd.Details
					isVisible={!!selectedRef}
					hide={() => setSelectedRef(null)}
					header={<ObjectDetailsHeader object={detailObject} calendars={calendars} />}
				>
					<ObjectDetails
						object={detailObject}
						calendars={calendars}
						loading={detailLoading}
						onEdit={openEditEvent}
						onDelete={handleDeleteObject}
						hasOverride={detailHasOverride}
						onReset={handleResetOverride}
						hideHeader
					/>
				</Fcd.Details>
			</Fcd.Container>

			<CalendarEditor
				open={calEditorOpen}
				calendar={editingCal}
				onClose={() => setCalEditorOpen(false)}
				onSave={handleSaveCalendar}
			/>

			<EventEditor
				open={eventEditorOpen}
				calendars={eventCalendars}
				defaultCalendarId={editingEvent?.calId ?? defaultCalId}
				event={editingEvent}
				draft={eventDraft}
				firstDayOfWeek={firstDayOfWeek}
				onClose={() => {
					setEventEditorOpen(false)
					setEventDraft(null)
				}}
				onSave={handleSaveEvent}
			/>

			<TaskEditor
				open={taskEditorOpen}
				calendars={taskCalendars}
				defaultCalendarId={editingTask?.calId ?? defaultCalId}
				task={editingTask}
				onClose={() => setTaskEditorOpen(false)}
				onSave={handleSaveTask}
			/>

			<RecurringEditScopeDialog
				open={!!scopePrompt}
				mode={scopePrompt?.kind === 'delete' ? 'delete' : 'edit'}
				occurrenceDate={scopePrompt?.occurrenceStart ?? ''}
				locale={i18n.language}
				onChoose={handleScopeChoose}
				onCancel={handleScopeCancel}
			/>

			{toolbarMenu && (
				<Menu position={toolbarMenu} onClose={() => setToolbarMenu(null)}>
					<MenuItem
						icon={<IcAdd />}
						label={t('New event')}
						disabled={noCalendars}
						onClick={() => {
							setToolbarMenu(null)
							openCreateEvent()
						}}
					/>
					<MenuItem
						icon={<IcAdd />}
						label={t('New task')}
						disabled={taskCalendars.length === 0}
						onClick={() => {
							setToolbarMenu(null)
							openCreateTask()
						}}
					/>
					<MenuDivider />
					<MenuItem
						icon={showOverrideGhosts ? <IcCheck /> : <IcGhost />}
						label={t('Show original positions')}
						onClick={async () => {
							setToolbarMenu(null)
							if (!api) return
							const next = !showOverrideGhosts
							setCalendarSettings?.((s) => ({
								...s,
								'ui.calendar.show_override_ghosts': next
							}))
							try {
								await api.settings.update('ui.calendar.show_override_ghosts', {
									value: next
								})
							} catch (err) {
								setCalendarSettings?.((s) => ({
									...s,
									'ui.calendar.show_override_ghosts': showOverrideGhosts
								}))
								toast.error(
									err instanceof Error
										? err.message
										: t('Failed to update setting')
								)
							}
						}}
					/>
					<MenuDivider />
					<MenuItem
						icon={<IcNewCal />}
						label={t('New calendar')}
						onClick={() => {
							setToolbarMenu(null)
							openCreateCalendar()
						}}
					/>
				</Menu>
			)}
		</>
	)
}

// vim: ts=4
