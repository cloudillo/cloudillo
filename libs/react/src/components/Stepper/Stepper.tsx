// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { mergeClasses } from '../utils.js'

export interface StepperProps {
	/** Number of steps */
	count: number
	/** Zero-based index of the current step */
	current: number
	/** Accessible name of the step list (e.g. "Setup progress") */
	label?: string
	className?: string
}

/**
 * Progress dots for a multi-step flow. Steps up to `current` are filled; screen
 * readers get "Step n of m" instead of the dots.
 */
export function Stepper({ count, current, label, className }: StepperProps) {
	const { t } = useLibTranslation()
	return (
		<div className={mergeClasses('c-stepper', className)}>
			<ol aria-label={label}>
				{Array.from({ length: count }, (_, i) => (
					<li
						key={i}
						className={i <= current ? 'done' : undefined}
						aria-current={i === current ? 'step' : undefined}
					/>
				))}
			</ol>
			<span className="sr-only">
				{t('Step {{current}} of {{total}}', { current: current + 1, total: count })}
			</span>
		</div>
	)
}

// vim: ts=4
