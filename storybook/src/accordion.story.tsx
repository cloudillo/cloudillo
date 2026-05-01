// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Story, Variant } from './storybook.js'
import { Accordion, AccordionItem } from '@cloudillo/react'
import { LuSettings, LuLock, LuBell, LuUser } from 'react-icons/lu'

export function AccordionStory() {
	return (
		<Story
			name="Accordion"
			description="Collapsible sections sharing a single container. By default only one section is open at a time; pass `multiple` to allow several open together."
			props={[
				{
					name: 'defaultOpen',
					type: 'string[]',
					descr: 'Item ids open on mount'
				},
				{
					name: 'multiple',
					type: 'boolean',
					descr: 'Allow multiple items open simultaneously (default false)'
				},
				{
					name: 'borderless',
					type: 'boolean',
					descr: 'Remove outer border + dividers'
				},
				{ name: 'compact', type: 'boolean', descr: 'Reduced padding' }
			]}
		>
			<Variant name="Single-open (default)">
				<Accordion defaultOpen={['general']}>
					<AccordionItem id="general" title="General" icon={<LuSettings />}>
						<p>Locale, timezone, default view.</p>
					</AccordionItem>
					<AccordionItem id="account" title="Account" icon={<LuUser />}>
						<p>Display name, email, profile picture.</p>
					</AccordionItem>
					<AccordionItem id="security" title="Security" icon={<LuLock />}>
						<p>Password, two-factor, active sessions.</p>
					</AccordionItem>
					<AccordionItem id="notifications" title="Notifications" icon={<LuBell />}>
						<p>Email digests, push notifications, channel preferences.</p>
					</AccordionItem>
				</Accordion>
			</Variant>

			<Variant
				name="Multiple open"
				description="multiple={true} lets users keep several sections open at once."
			>
				<Accordion defaultOpen={['a', 'c']} multiple>
					<AccordionItem id="a" title="Section A">
						<p>Both A and C start open.</p>
					</AccordionItem>
					<AccordionItem id="b" title="Section B">
						<p>Opening B does not close A or C.</p>
					</AccordionItem>
					<AccordionItem id="c" title="Section C">
						<p>Content for C.</p>
					</AccordionItem>
				</Accordion>
			</Variant>

			<Variant name="Borderless + compact">
				<Accordion borderless compact defaultOpen={['q1']}>
					<AccordionItem id="q1" title="How do I share a folder?">
						<p>Right-click and choose Share, or use the share button in the toolbar.</p>
					</AccordionItem>
					<AccordionItem id="q2" title="Can I work offline?">
						<p>Yes — changes sync automatically when you reconnect.</p>
					</AccordionItem>
					<AccordionItem id="q3" title="Where is my data stored?">
						<p>On your own node, encrypted at rest.</p>
					</AccordionItem>
				</Accordion>
			</Variant>
		</Story>
	)
}

// vim: ts=4
