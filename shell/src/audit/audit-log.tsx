// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	type AdminAuditListQuery,
	AUDIT_OPTIONAL_CATEGORIES,
	type AuditEvent,
	errorMessage
} from '@cloudillo/core'
import {
	Alert,
	Badge,
	Button,
	Field,
	Form,
	HBox,
	Input,
	List,
	ListItem,
	NativeSelect,
	Table,
	TableCell,
	TableRow,
	Text,
	useToast,
	VBox
} from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '../settings/settings.js'

const ALL_CATEGORIES = ['auth', 'admin', ...AUDIT_OPTIONAL_CATEGORIES]
const ALWAYS_LOGGED = ['auth', 'admin']

interface AuditPage {
	events: AuditEvent[]
	nextCursor: number | null
}

/**
 * Pages through an audit list endpoint. `load` and `query` must be stable (a method of the
 * api client and a state value), since a change to either restarts from the first page.
 */
export function useAuditLog(
	load: ((query: AdminAuditListQuery) => Promise<AuditPage>) | undefined,
	query: AdminAuditListQuery
) {
	const [events, setEvents] = React.useState<AuditEvent[]>()
	const [nextCursor, setNextCursor] = React.useState<number | null>()
	const [error, setError] = React.useState<string>()
	// Only the latest request may land: drops a stale page after a filter change,
	// an older first page, and the first of a double "Load more"
	const seq = React.useRef(0)

	const fetchPage = React.useCallback(
		async (cursor?: number) => {
			if (!load) return
			const id = ++seq.current
			// Hide "Load more" while a new first page loads: the old cursor belongs to the old filter
			if (cursor === undefined) setNextCursor(undefined)
			try {
				const res = await load({ ...query, cursor })
				if (id !== seq.current) return
				setEvents((prev) =>
					cursor === undefined ? res.events : [...(prev ?? []), ...res.events]
				)
				setNextCursor(res.nextCursor)
				setError(undefined)
			} catch (err) {
				if (id !== seq.current) return
				// A failed first page must not leave the old filter's rows and cursor behind
				if (cursor === undefined) {
					setEvents(undefined)
				}
				setError(errorMessage(err))
			}
		},
		[load, query]
	)

	React.useEffect(() => {
		fetchPage()
	}, [fetchPage])

	return {
		events,
		error,
		loadMore: nextCursor != null ? () => fetchPage(nextCursor) : undefined
	}
}

/** Form-side filter values; `from`/`to` are `YYYY-MM-DD` dates */
interface AuditFilterForm {
	from: string
	to: string
	category: string
	event: string
	outcome: string
	actor: string
	idTag: string
}

/** Empty filter form limited to today */
export function defaultAuditFilter(): AuditFilterForm {
	const today = dayjs().format('YYYY-MM-DD')
	return { from: today, to: today, category: '', event: '', outcome: '', actor: '', idTag: '' }
}

export function toQuery(f: AuditFilterForm): AdminAuditListQuery {
	return {
		from: f.from ? dayjs(f.from).startOf('day').unix() : undefined,
		to: f.to ? dayjs(f.to).endOf('day').unix() : undefined,
		category: f.category || undefined,
		event: f.event.trim() || undefined,
		outcome: f.outcome.trim() || undefined,
		actor: f.actor.trim() || undefined,
		idTag: f.idTag.trim() || undefined
	}
}

/** Filter form; applies on submit. `admin` adds the actor and tenant fields. */
export function AuditFilters({
	admin,
	onApply
}: {
	admin?: boolean
	onApply: (query: AdminAuditListQuery) => void
}) {
	const { t } = useTranslation()
	const [form, setForm] = React.useState(defaultAuditFilter)
	const [rangeError, setRangeError] = React.useState<string>()

	function set(evt: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
		const { name, value } = evt.target
		setForm((f) => ({ ...f, [name]: value }))
	}

	return (
		<Form
			onSubmit={(evt) => {
				evt.preventDefault()
				// `YYYY-MM-DD` strings compare like the dates they are
				if (form.from && form.to && form.from > form.to) {
					setRangeError(t('End date must be on or after the start date'))
					return
				}
				setRangeError(undefined)
				onApply(toQuery(form))
			}}
		>
			<HBox gap={2} wrap>
				<Field label={t('From date')}>
					<Input type="date" name="from" value={form.from} onChange={set} />
				</Field>
				<Field label={t('To date')}>
					<Input type="date" name="to" value={form.to} onChange={set} />
				</Field>
				<Field label={t('Category')}>
					<NativeSelect name="category" value={form.category} onChange={set}>
						<option value="">{t('All')}</option>
						{ALL_CATEGORIES.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</NativeSelect>
				</Field>
				<Field label={t('Event')}>
					<Input name="event" value={form.event} onChange={set} />
				</Field>
				<Field label={t('Outcome')}>
					<Input name="outcome" value={form.outcome} onChange={set} />
				</Field>
				{admin && (
					<>
						<Field label={t('Actor')}>
							<Input name="actor" value={form.actor} onChange={set} />
						</Field>
						<Field label={t('Tenant')}>
							<Input name="idTag" value={form.idTag} onChange={set} />
						</Field>
					</>
				)}
			</HBox>
			{rangeError && (
				<Alert color="error" className="mt-2">
					{rangeError}
				</Alert>
			)}
			<HBox gap={2} className="mt-2">
				<Button type="submit" color="primary" size="sm">
					{t('Apply filters')}
				</Button>
			</HBox>
		</Form>
	)
}

/** Audit rows as a table. `showTenant` adds the tenant id column (site-admin view). */
export function AuditTable({
	events,
	showTenant,
	label
}: {
	events: AuditEvent[]
	showTenant?: boolean
	label: string
}) {
	const { t } = useTranslation()
	const columns = [t('Time'), t('Event'), t('Category'), t('Outcome'), t('IP'), t('Actor')]
	if (showTenant) columns.push(t('Tenant'))

	return (
		<Table variant="hoverable" stack aria-label={label} columns={columns}>
			{events.map((ev) => (
				<TableRow key={ev.id}>
					<TableCell>{dayjs(ev.ts).format('YYYY-MM-DD HH:mm:ss')}</TableCell>
					<TableCell>{ev.event}</TableCell>
					<TableCell>{ev.category}</TableCell>
					<TableCell>
						<Badge size="sm" color={ev.outcome === 'success' ? 'success' : 'error'}>
							{ev.outcome}
						</Badge>
					</TableCell>
					<TableCell>{ev.ip ?? '—'}</TableCell>
					<TableCell>{ev.actor ?? '—'}</TableCell>
					{showTenant && <TableCell>{ev.tnId ?? '—'}</TableCell>}
				</TableRow>
			))}
		</Table>
	)
}

/** Table + empty/error state + "Load more", for either list endpoint */
export function AuditLogView({
	log,
	showTenant,
	label
}: {
	log: ReturnType<typeof useAuditLog>
	showTenant?: boolean
	label: string
}) {
	const { t } = useTranslation()
	return (
		<VBox gap={2}>
			{log.error && <Alert color="error">{log.error}</Alert>}
			{log.events && log.events.length === 0 && (
				<Text emphasis="muted">{t('No events.')}</Text>
			)}
			{log.events && log.events.length > 0 && (
				<AuditTable events={log.events} showTenant={showTenant} label={label} />
			)}
			{log.loadMore && (
				<HBox>
					<Button size="sm" onClick={log.loadMore}>
						{t('Load more')}
					</Button>
				</HBox>
			)}
		</VBox>
	)
}

/**
 * Category switches for an audit category setting. `locked` ones are summed up in
 * one "Always logged" line; only the rest of `AUDIT_OPTIONAL_CATEGORIES` get a switch.
 * `readOnly` shows just the logged categories. Render as a direct child of a Panel.
 */
export function AuditCategorySwitches({
	enabled,
	locked,
	readOnly,
	onSave
}: {
	enabled: string[]
	locked: string[]
	readOnly?: boolean
	/** Persists `next`; the caller commits it to `enabled` on success. A rejection reverts. */
	onSave: (next: string[]) => Promise<void>
}) {
	const { t } = useTranslation()
	const { error: toastError } = useToast()
	// One save at a time; `pending` shows the toggle optimistically until it settles
	const [busy, setBusy] = React.useState(false)
	const [pending, setPending] = React.useState<string[]>()
	const shown = pending ?? enabled
	const lockedAll = ALL_CATEGORIES.filter((c) => ALWAYS_LOGGED.includes(c) || locked.includes(c))
	const summary = readOnly
		? t('Logged: {{list}}', {
				list: ALL_CATEGORIES.filter((c) => lockedAll.includes(c) || shown.includes(c)).join(
					', '
				)
			})
		: t('Always logged: {{list}}', { list: lockedAll.join(', ') })
	return (
		<List variant="divided">
			<ListItem title={<Text emphasis="muted">{summary}</Text>} />
			{!readOnly &&
				ALL_CATEGORIES.filter((cat) => !lockedAll.includes(cat)).map((cat) => (
					<SwitchRow
						key={cat}
						label={cat}
						checked={shown.includes(cat)}
						disabled={busy}
						onChange={async (evt) => {
							// Never send auth/admin: rebuild from the optional set only
							const on = evt.target.checked
							const next = AUDIT_OPTIONAL_CATEGORIES.filter((c) =>
								c === cat ? on : shown.includes(c)
							)
							setPending(next)
							setBusy(true)
							try {
								await onSave(next)
							} catch (err) {
								toastError(err instanceof Error ? err.message : t('Failed to save'))
							} finally {
								setPending(undefined)
								setBusy(false)
							}
						}}
					/>
				))}
		</List>
	)
}

// vim: ts=4
