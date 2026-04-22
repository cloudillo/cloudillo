// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	buildRruleFromState,
	dateInputToRfc5545EndOfDay,
	defaultRruleState,
	parseRruleToState,
	rfc5545ToDateInput,
	rruleToHuman,
	type EndMode,
	type IcalDayCode,
	type MonthlyMode,
	type RruleFreq,
	type RruleState
} from '../utils.js'

import { DayChipGroup } from './DayChipGroup.js'

interface Props {
	/** Current RRULE string, or undefined for "does not repeat". */
	value: string | undefined
	onChange: (rrule: string | undefined) => void
	/** Series anchor (any dayjs-parseable value). Used to seed weekday / day-of-month
	 *  defaults when the user first picks a frequency. */
	startDate: string | undefined
	allDay: boolean
	locale: string
	firstDayOfWeek?: 0 | 1
}

type FrequencyChoice = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'

function freqOfState(state: RruleState | null): FrequencyChoice {
	if (!state) return 'custom'
	switch (state.freq) {
		case 'DAILY':
			return 'daily'
		case 'WEEKLY':
			return 'weekly'
		case 'MONTHLY':
			return 'monthly'
		case 'YEARLY':
			return 'yearly'
	}
}

/** Inline RRULE builder with progressive disclosure. Falls back to a raw textbox when
 *  the stored rule uses constructs the builder can't model (BYWEEKNO, BYYEARDAY, ...) so
 *  clients who sync from Apple Calendar or DAVx⁵ never lose their rule. */
export function RecurrenceBuilder({
	value,
	onChange,
	startDate,
	allDay,
	locale,
	firstDayOfWeek = 1
}: Props) {
	const { t } = useTranslation()

	// Parse incoming RRULE into builder state, or null if exotic.
	const parsed = React.useMemo(
		() => (value ? parseRruleToState(value, startDate) : null),
		[value, startDate]
	)
	// Keep the last valid builder state so flipping to Custom and back doesn't lose edits.
	const [state, setState] = React.useState<RruleState>(
		() => parsed ?? defaultRruleState(startDate)
	)
	const [customText, setCustomText] = React.useState(value ?? '')
	const initialChoice: FrequencyChoice = !value ? 'none' : parsed ? freqOfState(parsed) : 'custom'
	const [choice, setChoice] = React.useState<FrequencyChoice>(initialChoice)

	// When `value` changes externally (editing a different event), reseed.
	const lastValueRef = React.useRef<string | undefined>(value)
	React.useEffect(() => {
		if (value === lastValueRef.current) return
		lastValueRef.current = value
		if (!value) {
			setChoice('none')
			setCustomText('')
			return
		}
		const reparsed = parseRruleToState(value, startDate)
		if (reparsed) {
			setState(reparsed)
			setChoice(freqOfState(reparsed))
			setCustomText('')
		} else {
			setChoice('custom')
			setCustomText(value)
		}
	}, [value, startDate])

	const emit = (next: RruleState) => {
		setState(next)
		onChange(buildRruleFromState(next))
	}

	const switchTo = (nextChoice: FrequencyChoice) => {
		setChoice(nextChoice)
		if (nextChoice === 'none') {
			onChange(undefined)
			return
		}
		if (nextChoice === 'custom') {
			// Seed the textbox from the current state so the user sees something to edit.
			const seeded = customText || buildRruleFromState(state)
			setCustomText(seeded)
			onChange(seeded)
			return
		}
		const mapped: RruleFreq =
			nextChoice === 'daily'
				? 'DAILY'
				: nextChoice === 'weekly'
					? 'WEEKLY'
					: nextChoice === 'monthly'
						? 'MONTHLY'
						: 'YEARLY'
		const next: RruleState = { ...state, freq: mapped }
		emit(next)
	}

	const summary = React.useMemo(
		() => (choice !== 'none' && value ? rruleToHuman(value, locale, t) : null),
		[choice, value, locale, t]
	)

	const unitLabel = (freq: RruleFreq, n: number): string => {
		switch (freq) {
			case 'DAILY':
				return n === 1 ? t('day') : t('days')
			case 'WEEKLY':
				return n === 1 ? t('week') : t('weeks')
			case 'MONTHLY':
				return n === 1 ? t('month') : t('months')
			case 'YEARLY':
				return n === 1 ? t('year') : t('years')
		}
	}

	return (
		<div className="c-cal-rrule-builder">
			<select
				className="c-input"
				value={choice}
				onChange={(e) => switchTo(e.target.value as FrequencyChoice)}
				aria-label={t('Repeat')}
			>
				<option value="none">{t('Does not repeat')}</option>
				<option value="daily">{t('Daily')}</option>
				<option value="weekly">{t('Weekly')}</option>
				<option value="monthly">{t('Monthly')}</option>
				<option value="yearly">{t('Yearly')}</option>
				<option value="custom">{t('Custom…')}</option>
			</select>

			{choice !== 'none' && choice !== 'custom' && (
				<>
					<div className="c-cal-rrule-builder__row">
						<span>{t('Every')}</span>
						<input
							className="c-input"
							type="number"
							min={1}
							max={99}
							value={state.interval}
							onChange={(e) => {
								const n = Math.max(1, Math.min(99, Number(e.target.value) || 1))
								emit({ ...state, interval: n })
							}}
							style={{ width: '5rem' }}
							aria-label={t('Interval')}
						/>
						<span>{unitLabel(state.freq, state.interval)}</span>
					</div>

					{choice === 'weekly' && (
						<div className="c-cal-rrule-builder__row">
							<span>{t('On')}</span>
							<DayChipGroup
								value={state.byday}
								onChange={(byday) =>
									emit({
										...state,
										byday: byday.length > 0 ? byday : state.byday
									})
								}
								firstDayOfWeek={firstDayOfWeek}
								locale={locale}
								aria-label={t('Repeat on days')}
							/>
						</div>
					)}

					{choice === 'monthly' && (
						<fieldset
							className="c-cal-rrule-builder__row"
							style={{ border: 'none', padding: 0, margin: 0 }}
						>
							<legend className="sr-only">{t('Monthly pattern')}</legend>
							<label className="d-flex align-items-center g-2">
								<input
									type="radio"
									name="monthly-mode"
									checked={state.monthlyMode === 'day'}
									onChange={() =>
										emit({ ...state, monthlyMode: 'day' as MonthlyMode })
									}
								/>
								{t('On day')}
								<input
									className="c-input"
									type="number"
									min={1}
									max={31}
									value={state.bymonthday}
									onChange={(e) => {
										const n = Math.max(
											1,
											Math.min(31, Number(e.target.value) || 1)
										)
										emit({
											...state,
											monthlyMode: 'day' as MonthlyMode,
											bymonthday: n
										})
									}}
									style={{ width: '4rem' }}
									disabled={state.monthlyMode !== 'day'}
									aria-label={t('Day of month')}
								/>
							</label>
							<label className="d-flex align-items-center g-2">
								<input
									type="radio"
									name="monthly-mode"
									checked={state.monthlyMode === 'weekday'}
									onChange={() =>
										emit({ ...state, monthlyMode: 'weekday' as MonthlyMode })
									}
								/>
								{t('On the')}
								<select
									className="c-input"
									value={state.bysetpos}
									onChange={(e) =>
										emit({
											...state,
											monthlyMode: 'weekday' as MonthlyMode,
											bysetpos: Number(e.target.value)
										})
									}
									disabled={state.monthlyMode !== 'weekday'}
									style={{ width: '8rem' }}
								>
									<option value={1}>{t('first')}</option>
									<option value={2}>{t('second')}</option>
									<option value={3}>{t('third')}</option>
									<option value={4}>{t('fourth')}</option>
									<option value={-1}>{t('last')}</option>
								</select>
								<select
									className="c-input"
									value={state.byday1}
									onChange={(e) =>
										emit({
											...state,
											monthlyMode: 'weekday' as MonthlyMode,
											byday1: e.target.value as IcalDayCode
										})
									}
									disabled={state.monthlyMode !== 'weekday'}
									style={{ width: '8rem' }}
								>
									{(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const).map(
										(code) => {
											const dow = {
												SU: 0,
												MO: 1,
												TU: 2,
												WE: 3,
												TH: 4,
												FR: 5,
												SA: 6
											}[code]
											const anchor = dayjs('2024-01-07')
												.add(dow, 'day')
												.toDate()
											const label = new Intl.DateTimeFormat(locale, {
												weekday: 'long'
											}).format(anchor)
											return (
												<option key={code} value={code}>
													{label}
												</option>
											)
										}
									)}
								</select>
							</label>
						</fieldset>
					)}

					{choice === 'yearly' && (
						<div className="c-cal-rrule-builder__row" aria-live="polite">
							<span>
								{t('On {{date}}', {
									date: new Intl.DateTimeFormat(locale, {
										month: 'long',
										day: 'numeric'
									}).format(
										dayjs()
											.year(2024)
											.month(state.bymonth - 1)
											.date(state.yearlyDay)
											.toDate()
									)
								})}
							</span>
						</div>
					)}

					<fieldset
						className="c-cal-rrule-builder__row"
						style={{ border: 'none', padding: 0, margin: 0 }}
					>
						<legend className="sr-only">{t('Ends')}</legend>
						<label className="d-flex align-items-center g-2">
							<input
								type="radio"
								name="rrule-end"
								checked={state.endMode === 'never'}
								onChange={() => emit({ ...state, endMode: 'never' as EndMode })}
							/>
							{t('Never ends')}
						</label>
						<label className="d-flex align-items-center g-2">
							<input
								type="radio"
								name="rrule-end"
								checked={state.endMode === 'count'}
								onChange={() => emit({ ...state, endMode: 'count' as EndMode })}
							/>
							{t('After')}
							<input
								className="c-input"
								type="number"
								min={1}
								max={999}
								value={state.count}
								onChange={(e) => {
									const n = Math.max(
										1,
										Math.min(999, Number(e.target.value) || 1)
									)
									emit({
										...state,
										endMode: 'count' as EndMode,
										count: n
									})
								}}
								style={{ width: '5rem' }}
								disabled={state.endMode !== 'count'}
								aria-label={t('Number of occurrences')}
							/>
							{t('occurrences')}
						</label>
						<label className="d-flex align-items-center g-2">
							<input
								type="radio"
								name="rrule-end"
								checked={state.endMode === 'until'}
								onChange={() => emit({ ...state, endMode: 'until' as EndMode })}
							/>
							{t('On')}
							<input
								className="c-input"
								type="date"
								value={rfc5545ToDateInput(state.until)}
								onChange={(e) =>
									emit({
										...state,
										endMode: 'until' as EndMode,
										until: dateInputToRfc5545EndOfDay(e.target.value, allDay)
									})
								}
								disabled={state.endMode !== 'until'}
								aria-label={t('End date')}
							/>
						</label>
					</fieldset>

					{summary && <div className="c-cal-rrule-summary">{summary}</div>}
				</>
			)}

			{choice === 'custom' && (
				<div className="c-cal-rrule-builder__row">
					<input
						className="c-input"
						placeholder="FREQ=WEEKLY;INTERVAL=2"
						value={customText}
						onChange={(e) => {
							setCustomText(e.target.value)
							onChange(e.target.value.trim() || undefined)
						}}
						style={{ fontFamily: 'monospace', flex: 1 }}
						aria-label={t('Custom RRULE')}
					/>
				</div>
			)}
		</div>
	)
}
