// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Logo, Stepper } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

export function LogoStory() {
	return (
		<Story
			name="Logo"
			description="The Cloudillo mark. `animated` is decorative: pair it with role=status text. Off under reduced motion."
			props={[
				{
					name: 'size',
					type: 'number | string',
					descr: 'Maximum width (px or CSS length); default fills the container up to 16rem'
				},
				{ name: 'animated', type: 'boolean', descr: 'Pulse the nodes (busy state)' },
				{
					name: 'label',
					type: 'string',
					descr: 'Accessible name; without it the logo is aria-hidden'
				}
			]}
		>
			<Variant name="Sizes">
				<div className="c-hbox g-2 align-items-center">
					<Logo size={48} />
					<Logo size="8rem" label="Cloudillo" />
				</div>
			</Variant>
			<Variant name="Busy">
				<div className="c-hbox g-2 align-items-center">
					<Logo size="8rem" animated />
					<span role="status">Connecting…</span>
				</div>
			</Variant>
		</Story>
	)
}

export function StepperStory() {
	return (
		<Story
			name="Stepper"
			description='Progress dots for multi-step flows; screen readers hear "Step n of m".'
			props={[
				{ name: 'count', type: 'number', descr: 'Number of steps' },
				{ name: 'current', type: 'number', descr: 'Zero-based index of the current step' },
				{ name: 'label', type: 'string', descr: 'Accessible name of the step list' }
			]}
		>
			<Variant name="Progress">
				<div className="c-vbox g-2">
					<Stepper count={3} current={0} label="Setup progress" />
					<Stepper count={4} current={2} />
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
