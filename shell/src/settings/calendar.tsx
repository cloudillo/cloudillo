// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { localeFirstDay } from '@cloudillo/calendar-ui'
import { LoadingSpinner, useApi, useToast } from '@cloudillo/react'

import { useSettings } from './settings.js'

/** Coerce a setting value into a boolean. Settings can come back from the API as
 *  native booleans, `0/1`, or the strings `'true'/'false'/'0'/'1'` depending on
 *  how they round-tripped through storage. */
function parseBoolean(value: unknown): boolean {
	if (value === true || value === 1 || value === '1' || value === 'true') return true
	return false
}

/** Locale-aware short weekday names indexed by JS day-of-week (0 = Sunday). */
function useWeekdayNames(): string[] {
	const { i18n } = useTranslation()
	return React.useMemo(() => {
		const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
		const out: string[] = []
		for (let i = 0; i < 7; i++) {
			out.push(fmt.format(new Date(2024, 0, 7 + i)))
		}
		return out
	}, [i18n.language])
}

function hourLabel(h: number): string {
	return `${h.toString().padStart(2, '0')}:00`
}

export function CalendarSettings() {
	const { t, i18n } = useTranslation()
	const { api } = useApi()
	const { error: toastError } = useToast()
	const weekdayNames = useWeekdayNames()
	const { settings, setSettings, onSettingChange } = useSettings('ui.calendar')

	const workingDaysRaw = settings?.['ui.calendar.working_days']
	const workingDays = React.useMemo<number[]>(() => {
		if (typeof workingDaysRaw !== 'string') return [1, 2, 3, 4, 5]
		const parsed = workingDaysRaw
			.split(',')
			.map((x) => Number(x.trim()))
			.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
		return parsed.length > 0 ? parsed : [1, 2, 3, 4, 5]
	}, [workingDaysRaw])

	// Effective first-day-of-week. Mirrors the settings ↔ locale-default
	// fallback used by `CalendarApp` so the toggle row matches the week-start
	// choice above (and reorders instantly when the user changes it).
	const weekStartSetting = settings?.['ui.calendar.week_start']
	const firstDay = React.useMemo<0 | 1>(() => {
		if (weekStartSetting === 0 || weekStartSetting === '0') return 0
		if (weekStartSetting === 1 || weekStartSetting === '1') return 1
		return localeFirstDay(i18n.language)
	}, [weekStartSetting, i18n.language])
	const weekdayOrder = React.useMemo(
		() => Array.from({ length: 7 }, (_, i) => (firstDay + i) % 7),
		[firstDay]
	)

	const toggleWorkingDay = React.useCallback(
		async (dow: number, on: boolean) => {
			if (!api) return
			const previous = workingDays
			const next = on
				? Array.from(new Set([...workingDays, dow])).sort()
				: workingDays.filter((d) => d !== dow)
			const value = next.join(',')
			setSettings?.((s) => ({ ...s, 'ui.calendar.working_days': value }))
			try {
				await api.settings.update('ui.calendar.working_days', { value })
			} catch (_err) {
				setSettings?.((s) => ({
					...s,
					'ui.calendar.working_days': previous.join(',')
				}))
				toastError(t('Failed to save setting. Please try again.'))
			}
		},
		[api, workingDays, setSettings, t, toastError]
	)

	if (!settings) return <LoadingSpinner />

	const weekStart = settings['ui.calendar.week_start']
	const weekStartValue =
		weekStart === 0 || weekStart === '0' ? '0' : weekStart === 1 || weekStart === '1' ? '1' : ''

	const whStartRaw = settings['ui.calendar.working_hours_start']
	const whEndRaw = settings['ui.calendar.working_hours_end']
	const parseHour = (raw: unknown, fallback: number): number => {
		const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
		return Number.isFinite(n) ? n : fallback
	}
	const whStart = parseHour(whStartRaw, 9)
	const whEnd = parseHour(whEndRaw, 17)

	return (
		<div className="c-panel">
			<label className="c-settings-field">
				<span>{t('Week starts on')}</span>
				<select
					className="c-select"
					name="ui.calendar.week_start"
					value={weekStartValue}
					onChange={onSettingChange}
				>
					<option value="">{t('Automatic (locale default)')}</option>
					<option value="0">{t('Sunday')}</option>
					<option value="1">{t('Monday')}</option>
				</select>
			</label>

			<div className="c-settings-field">
				<span>{t('Working hours')}</span>
				<div className="d-flex align-items-center g-2">
					<select
						className="c-select"
						name="ui.calendar.working_hours_start"
						value={String(whStart)}
						onChange={onSettingChange}
						aria-label={t('Start of working hours')}
					>
						{Array.from({ length: 24 }, (_, h) => (
							<option key={h} value={String(h)}>
								{hourLabel(h)}
							</option>
						))}
					</select>
					<span>–</span>
					<select
						className="c-select"
						name="ui.calendar.working_hours_end"
						value={String(whEnd)}
						onChange={onSettingChange}
						aria-label={t('End of working hours')}
					>
						{Array.from({ length: 25 }, (_, h) => (
							<option key={h} value={String(h)} disabled={h <= whStart}>
								{hourLabel(h)}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="c-settings-field">
				<span>{t('Working days')}</span>
				<div className="d-flex g-1 flex-wrap" role="group" aria-label={t('Working days')}>
					{weekdayOrder.map((dow) => {
						const isOn = workingDays.includes(dow)
						return (
							<button
								key={dow}
								type="button"
								className="c-button"
								aria-pressed={isOn}
								onClick={() => toggleWorkingDay(dow, !isOn)}
								style={{
									minWidth: '3rem',
									opacity: isOn ? 1 : 0.55
								}}
							>
								{weekdayNames[dow]}
							</button>
						)
					})}
				</div>
			</div>

			<label className="c-settings-field">
				<span>{t('Show original positions for moved occurrences')}</span>
				<input
					className="c-toggle primary"
					type="checkbox"
					name="ui.calendar.show_override_ghosts"
					checked={parseBoolean(settings['ui.calendar.show_override_ghosts'])}
					onChange={onSettingChange}
				/>
			</label>
		</div>
	)
}

// vim: ts=4
