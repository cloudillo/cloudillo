// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Combobox, SkipLink } from '@cloudillo/react'
import * as React from 'react'
import { LuUser as IcUser } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

// Mock data for examples
const mockUsers = [
	{ id: '1', name: 'Alice Anderson', email: 'alice@example.com', team: 'Design' },
	{ id: '2', name: 'Bob Builder', email: 'bob@example.com', team: 'Engineering' },
	{ id: '3', name: 'Charlie Developer', email: 'charlie@example.com', team: 'Engineering' },
	{ id: '4', name: 'Dana Engineer', email: 'dana@example.com', team: 'Engineering' },
	{ id: '5', name: 'Eve Administrator', email: 'eve@example.com', team: 'Operations' }
]

type User = (typeof mockUsers)[0]

async function getData(q: string): Promise<User[]> {
	// Simulate async search
	await new Promise((resolve) => setTimeout(resolve, 100))
	return mockUsers.filter(
		(u) =>
			u.name.toLowerCase().includes(q.toLowerCase()) ||
			u.email.toLowerCase().includes(q.toLowerCase())
	)
}

const common = {
	autoFocus: false,
	getData,
	itemToId: (item: User) => item.id,
	itemToString: (item: User | null) => item?.name || '',
	renderItem: (item: User) => item.name
}

export function ComboboxStory() {
	const [picked, setPicked] = React.useState<User[]>([])

	return (
		<Story
			name="Combobox"
			description="Async autocomplete (Downshift). Options render as ListItems in a top-layer popover; reads FieldContext for its label."
			props={[
				{
					name: 'getData',
					type: '(q: string) => Promise<T[] | undefined>',
					descr: 'Async option source, debounced 500ms',
					required: true
				},
				{
					name: 'renderItem',
					type: '(item: T) => React.ReactNode',
					descr: 'Option title',
					required: true
				},
				{
					name: 'itemToId',
					type: '(item: T) => string',
					descr: 'Unique option id',
					required: true
				},
				{
					name: 'itemToString',
					type: '(item: T | null) => string',
					descr: 'Option text for the input',
					required: true
				},
				{
					name: 'onSelect',
					type: '(item: T) => void',
					descr: 'Fired on every pick; the input clears'
				},
				{
					name: 'sections',
					type: '(item: T) => string',
					descr: 'Group key; a header per group, first-seen order'
				},
				{ name: 'leading', type: '(item: T) => ReactNode', descr: 'Leading slot' },
				{ name: 'trailing', type: '(item: T) => ReactNode', descr: 'Trailing slot' },
				{
					name: 'shortcut',
					type: '(item: T) => string | undefined',
					descr: 'Keyboard hint at the end of the option'
				},
				{
					name: 'emptyText',
					type: 'ReactNode',
					descr: 'Shown when a non-empty query has no options'
				},
				{ name: 'loading', type: 'boolean', descr: 'Overrides the in-flight indicator' },
				{ name: 'multiple', type: 'boolean', descr: 'Keep the list open after a pick' },
				{ name: 'placeholder', type: 'string', descr: 'Input placeholder' },
				{ name: 'autoFocus', type: 'boolean', descr: 'Defaults to true' }
			]}
		>
			<Variant name="Basic">
				<Combobox<User>
					{...common}
					placeholder="Search users..."
					onSelect={(item) => setPicked([item])}
				/>
			</Variant>

			<Variant name="Sections, leading and shortcut">
				<Combobox<User>
					{...common}
					placeholder="Search by team..."
					sections={(item) => item.team}
					leading={() => <IcUser />}
					shortcut={(item) => (item.id === '1' ? 'Ctrl+1' : undefined)}
					onSelect={(item) => setPicked([item])}
				/>
			</Variant>

			<Variant name="Multiple, with emptyText">
				<Combobox<User>
					{...common}
					multiple
					placeholder="Add users..."
					emptyText="No matching users"
					onSelect={(item) => setPicked((p) => [...p, item])}
				/>
			</Variant>

			<div className="p-2 text-muted">
				Picked: {picked.map((u) => u.name).join(', ') || '—'}
			</div>
		</Story>
	)
}

export function SkipLinkStory() {
	return (
		<Story
			name="SkipLink"
			description="Visually hidden until focused. Render it as the first focusable element of the page, pointing at the main landmark."
			props={[
				{ name: 'href', type: 'string', descr: 'Target fragment, defaults to #main' },
				{ name: 'children', type: 'ReactNode', descr: 'Defaults to "Skip to main content"' }
			]}
		>
			<Variant name="Basic (Tab into the preview to reveal)">
				<SkipLink href="#storybook-main" />
			</Variant>
		</Story>
	)
}

// vim: ts=4
