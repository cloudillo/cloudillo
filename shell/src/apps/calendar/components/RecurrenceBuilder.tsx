// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { HBox, Input, NativeSelect, RadioGroup, Text, VBox } from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	buildRruleFromState,
	dateInputToRfc5545EndOfDay,
	defaultRruleState,
	type EndMode,
	type IcalDayCode,
	type MonthlyMode,
	parseRruleToState,
	type RruleFreq,
	type RruleState,
	rfc5545ToDateInput,
	rruleToHuman
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
		<VBox gap={2}>
			<NativeSelect
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
			</NativeSelect>

			{choice !== 'none' && choice !== 'custom' && (
				<>
					<HBox gap={2} align="center" wrap>
						<Text>{t('Every')}</Text>
						<Input
							className="w-xs"
							type="number"
							min={1}
							max={99}
							value={state.interval}
							onChange={(e) => {
								const n = Math.max(1, Math.min(99, Number(e.target.value) || 1))
								emit({ ...state, interval: n })
							}}
							aria-label={t('Interval')}
						/>
						<Text>{unitLabel(state.freq, state.interval)}</Text>
					</HBox>

					{choice === 'weekly' && (
						<HBox gap={2} align="center" wrap>
							<Text>{t('On')}</Text>
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
						</HBox>
					)}

					{choice === 'monthly' && (
						<RadioGroup<MonthlyMode>
							aria-label={t('Monthly pattern')}
							value={state.monthlyMode}
							onChange={(monthlyMode) => emit({ ...state, monthlyMode })}
							options={[
								{
									value: 'day',
									label: (
										<HBox gap={2} align="center" wrap>
											{t('On day')}
											<Input
												className="w-xs"
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
														monthlyMode: 'day',
														bymonthday: n
													})
												}}
												disabled={state.monthlyMode !== 'day'}
												aria-label={t('Day of month')}
											/>
										</HBox>
									)
								},
								{
									value: 'weekday',
									label: (
										<HBox gap={2} align="center" wrap>
											{t('On the')}
											<NativeSelect
												className="w-sm"
												value={state.bysetpos}
												onChange={(e) =>
													emit({
														...state,
														monthlyMode: 'weekday',
														bysetpos: Number(e.target.value)
													})
												}
												disabled={state.monthlyMode !== 'weekday'}
												aria-label={t('Week of month')}
											>
												<option value={1}>{t('first')}</option>
												<option value={2}>{t('second')}</option>
												<option value={3}>{t('third')}</option>
												<option value={4}>{t('fourth')}</option>
												<option value={-1}>{t('last')}</option>
											</NativeSelect>
											<NativeSelect
												className="w-sm"
												value={state.byday1}
												onChange={(e) =>
													emit({
														...state,
														monthlyMode: 'weekday',
														byday1: e.target.value as IcalDayCode
													})
												}
												disabled={state.monthlyMode !== 'weekday'}
												aria-label={t('Weekday')}
											>
												{(
													[
														'SU',
														'MO',
														'TU',
														'WE',
														'TH',
														'FR',
														'SA'
													] as const
												).map((code) => {
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
												})}
											</NativeSelect>
										</HBox>
									)
								}
							]}
						/>
					)}

					{choice === 'yearly' && (
						<Text aria-live="polite">
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
						</Text>
					)}

					<RadioGroup<EndMode>
						aria-label={t('Ends')}
						value={state.endMode}
						onChange={(endMode) => emit({ ...state, endMode })}
						options={[
							{ value: 'never', label: t('Never ends') },
							{
								value: 'count',
								label: (
									<HBox gap={2} align="center" wrap>
										{t('After')}
										<Input
											className="w-xs"
											type="number"
											min={1}
											max={999}
											value={state.count}
											onChange={(e) => {
												const n = Math.max(
													1,
													Math.min(999, Number(e.target.value) || 1)
												)
												emit({ ...state, endMode: 'count', count: n })
											}}
											disabled={state.endMode !== 'count'}
											aria-label={t('Number of occurrences')}
										/>
										{t('occurrences')}
									</HBox>
								)
							},
							{
								value: 'until',
								label: (
									<HBox gap={2} align="center" wrap>
										{t('On')}
										<Input
											type="date"
											value={rfc5545ToDateInput(state.until)}
											onChange={(e) =>
												emit({
													...state,
													endMode: 'until',
													until: dateInputToRfc5545EndOfDay(
														e.target.value,
														allDay
													)
												})
											}
											disabled={state.endMode !== 'until'}
											aria-label={t('End date')}
										/>
									</HBox>
								)
							}
						]}
					/>

					{summary && (
						<Text size="sm" emphasis="muted">
							{summary}
						</Text>
					)}
				</>
			)}

			{choice === 'custom' && (
				<Input
					className="font-mono"
					placeholder="FREQ=WEEKLY;INTERVAL=2"
					value={customText}
					onChange={(e) => {
						setCustomText(e.target.value)
						onChange(e.target.value.trim() || undefined)
					}}
					aria-label={t('Custom RRULE')}
				/>
			)}
		</VBox>
	)
}
