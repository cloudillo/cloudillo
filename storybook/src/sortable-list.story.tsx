// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { SortableGroup, SortableList } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

function arrayMove<T>(list: T[], from: number, to: number): T[] {
	const next = [...list]
	const [item] = next.splice(from, 1)
	next.splice(to, 0, item)
	return next
}

const rowStyle: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 8,
	padding: '0 8px',
	borderBottom: '1px solid var(--col-outline)'
}

function Row({ label, handle }: { label: string; handle: React.ReactNode }) {
	return (
		<div style={rowStyle}>
			{handle}
			<span>{label}</span>
		</div>
	)
}

export function SortableListStory() {
	const [apps, setApps] = React.useState(['Files', 'Feed', 'Messages', 'Calendar', 'Contacts'])
	const [columns, setColumns] = React.useState<Record<string, string[]>>({
		main: ['Home', 'Files', 'Feed'],
		extra: ['Settings']
	})

	function reorderColumn(group: string) {
		return (from: number, to: number, source?: string) => {
			setColumns((cols) => {
				if (!source) return { ...cols, [group]: arrayMove(cols[group], from, to) }
				const moved = cols[source][from]
				const target = [...cols[group]]
				target.splice(to, 0, moved)
				return {
					...cols,
					[source]: cols[source].filter((_, i) => i !== from),
					[group]: target
				}
			})
		}
	}

	return (
		<Story
			name="SortableList"
			description="Reorderable list on dnd-kit. Drag the handle with a pointer, or focus it and press Space, move with arrow keys, Space/Enter to drop, Escape to cancel. Clicking or pressing Enter on the handle opens a Move menu (Move up / Move down / Move to top), the single-pointer alternative WCAG 2.2 SC 2.5.7 requires. Moves are announced in a live region."
			props={[
				{ name: 'items', type: 'T[]', descr: 'The list, owned by the caller' },
				{ name: 'getKey', type: '(item: T) => string', descr: 'Stable unique key' },
				{
					name: 'onReorder',
					type: '(from, to, group?) => void',
					descr: 'to = index after the move (arrayMove). Cross-list: called on the destination list with the source group'
				},
				{
					name: 'renderItem',
					type: '(item, { index, dragging, handle }) => ReactNode',
					descr: 'Place `handle` inside the rendered item'
				},
				{ name: 'getLabel', type: '(item: T) => string', descr: 'Name for announcements' },
				{
					name: 'handle',
					type: 'boolean',
					descr: 'Default true; false makes the whole item draggable (no Move menu)'
				},
				{
					name: 'group',
					type: 'string',
					descr: 'List id; lists under one SortableGroup trade items'
				}
			]}
		>
			<Variant name="Basic">
				<div style={{ width: 280, border: '1px solid var(--col-outline)' }}>
					<SortableList
						items={apps}
						getKey={(a) => a}
						getLabel={(a) => a}
						onReorder={(from, to) => setApps((l) => arrayMove(l, from, to))}
						renderItem={(a, { handle }) => <Row label={a} handle={handle} />}
					/>
				</div>
			</Variant>

			<Variant
				name="Linked lists (SortableGroup)"
				description="Two lists under one SortableGroup; drag between them, including into an empty one."
			>
				<SortableGroup>
					<div style={{ display: 'flex', gap: 16 }}>
						{Object.keys(columns).map((group) => (
							<div
								key={group}
								style={{ width: 200, border: '1px solid var(--col-outline)' }}
							>
								<strong>{group}</strong>
								<SortableList
									group={group}
									items={columns[group]}
									getKey={(a) => a}
									getLabel={(a) => a}
									onReorder={reorderColumn(group)}
									renderItem={(a, { handle }) => (
										<Row label={a} handle={handle} />
									)}
								/>
							</div>
						))}
					</div>
				</SortableGroup>
			</Variant>
		</Story>
	)
}

// vim: ts=4
