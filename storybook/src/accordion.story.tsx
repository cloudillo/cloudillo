// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Accordion, Clamp, Disclosure } from '@cloudillo/react'
import * as React from 'react'
import { LuBell, LuLock, LuSettings, LuUser } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

const LOREM =
	'Cloudillo keeps your documents, photos and conversations on a node you control. Share with anyone on any node, collaborate in real time, and keep working offline — changes sync when you reconnect. Nothing is stored on a central server, and nothing is mined for ads.'

function ControlledDisclosure() {
	const [open, setOpen] = React.useState(false)
	return (
		<>
			<p>Open: {String(open)}</p>
			<Disclosure summary="Controlled" open={open} onToggle={setOpen}>
				<p>State lives in the parent.</p>
			</Disclosure>
		</>
	)
}

export function AccordionStory() {
	return (
		<>
			<Story
				name="Disclosure"
				description="A native <details>/<summary> section. Uncontrolled via `defaultOpen`, or controlled via `open` + `onToggle`."
				props={[
					{ name: 'summary', type: 'ReactNode', descr: 'Summary row content' },
					{ name: 'icon', type: 'ReactNode', descr: 'Leading icon in the summary row' },
					{ name: 'open', type: 'boolean', descr: 'Controlled open state' },
					{ name: 'defaultOpen', type: 'boolean', descr: 'Initial open state' },
					{
						name: 'onToggle',
						type: '(open: boolean) => void',
						descr: 'Called after the user toggles it'
					},
					{
						name: 'variant',
						type: "'ghost' | 'panel'",
						descr: 'Plain row (default) or bordered box'
					}
				]}
			>
				<Variant name="Ghost (default)">
					<Disclosure summary="Advanced options" defaultOpen>
						<p>Hidden until the summary is clicked.</p>
					</Disclosure>
				</Variant>
				<Variant name="Panel">
					<Disclosure summary="Security" icon={<LuLock />} variant="panel">
						<p>Password, two-factor, active sessions.</p>
					</Disclosure>
				</Variant>
				<Variant name="Controlled">
					<ControlledDisclosure />
				</Variant>
			</Story>

			<Story
				name="Accordion"
				description="A group of Disclosures in one container. `exclusive` keeps at most one open (native `<details name>`)."
				props={[
					{
						name: 'exclusive',
						type: 'boolean',
						descr: 'At most one item open at a time (default false)'
					},
					{
						name: 'borderless',
						type: 'boolean',
						descr: 'Remove outer border + dividers'
					},
					{ name: 'compact', type: 'boolean', descr: 'Reduced padding' }
				]}
			>
				<Variant name="Exclusive">
					<Accordion exclusive>
						<Disclosure summary="General" icon={<LuSettings />} defaultOpen>
							<p>Locale, timezone, default view.</p>
						</Disclosure>
						<Disclosure summary="Account" icon={<LuUser />}>
							<p>Display name, email, profile picture.</p>
						</Disclosure>
						<Disclosure summary="Security" icon={<LuLock />}>
							<p>Password, two-factor, active sessions.</p>
						</Disclosure>
						<Disclosure summary="Notifications" icon={<LuBell />}>
							<p>Email digests, push notifications, channel preferences.</p>
						</Disclosure>
					</Accordion>
				</Variant>

				<Variant
					name="Independent"
					description="Without exclusive, items open on their own."
				>
					<Accordion>
						<Disclosure summary="Section A" defaultOpen>
							<p>Both A and C start open.</p>
						</Disclosure>
						<Disclosure summary="Section B">
							<p>Opening B does not close A or C.</p>
						</Disclosure>
						<Disclosure summary="Section C" defaultOpen>
							<p>Content for C.</p>
						</Disclosure>
					</Accordion>
				</Variant>

				<Variant name="Borderless + compact">
					<Accordion exclusive borderless compact>
						<Disclosure summary="How do I share a folder?" defaultOpen>
							<p>
								Right-click and choose Share, or use the share button in the
								toolbar.
							</p>
						</Disclosure>
						<Disclosure summary="Can I work offline?">
							<p>Yes — changes sync automatically when you reconnect.</p>
						</Disclosure>
						<Disclosure summary="Where is my data stored?">
							<p>On your own node, encrypted at rest.</p>
						</Disclosure>
					</Accordion>
				</Variant>
			</Story>

			<Story
				name="Clamp"
				description="Clamps content to `lines` lines. The Show more / Show less toggle appears only when the content overflows."
				props={[{ name: 'lines', type: 'number', descr: 'Visible lines while collapsed' }]}
			>
				<Variant name="Overflowing (lines=2)">
					<Clamp lines={2} className="mw-sm">
						{LOREM}
					</Clamp>
				</Variant>
				<Variant name="Fits (no toggle)">
					<Clamp lines={3}>A short line.</Clamp>
				</Variant>
			</Story>
		</>
	)
}

// vim: ts=4
