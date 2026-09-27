// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Avatar,
	Badge,
	Button,
	DescriptionList,
	IconText,
	List,
	ListItem,
	Meta,
	Toggle
} from '@cloudillo/react'
import * as React from 'react'
import {
	LuCalendar as IcCalendar,
	LuFileText as IcFile,
	LuPencil as IcEdit,
	LuTrash2 as IcDelete
} from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function ListStory() {
	const [clicked, setClicked] = React.useState('')
	const [single, setSingle] = React.useState('b')
	const [multi, setMulti] = React.useState<Set<string>>(new Set(['a']))
	const [notify, setNotify] = React.useState(true)

	function toggleMulti(id: string) {
		setMulti((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	return (
		<Story
			name="List"
			description="Rows with leading/title/subtitle/meta/actions/trailing. href/onClick rows are clickable as a whole via a stretched title link; actions stay separate tab stops. DescriptionList, Meta and IconText live alongside."
			props={[
				{
					name: 'variant',
					type: "'plain' | 'divided' | 'bordered'",
					descr: 'Row separation'
				},
				{ name: 'scroll', type: 'boolean', descr: 'Scroll inside the flex parent' },
				{
					name: 'selectable',
					type: "'single' | 'multiple'",
					descr: 'Listbox semantics; rows become options'
				},
				{
					name: 'marker',
					type: "'bullet' | 'number'",
					descr: 'Prose bullets / numbered steps'
				},
				{
					name: 'ListItem',
					type: 'leading title subtitle meta actions trailing href onClick selected disabled',
					descr: 'actions = hover-revealed; href adds a chevron'
				}
			]}
		>
			<Variant name="Whole-row click + actions">
				<List variant="bordered">
					<ListItem
						leading={<Avatar alt="Alice" />}
						title="Alice Example"
						subtitle="alice.example.org"
						meta={<Meta>Owner</Meta>}
						onClick={() => setClicked('Alice row')}
						actions={
							<>
								<Button
									size="sm"
									variant="ghost"
									icon={<IcEdit />}
									aria-label="Edit"
									onClick={() => setClicked('Alice edit')}
								/>
								<Button
									size="sm"
									variant="ghost"
									icon={<IcDelete />}
									aria-label="Delete"
									onClick={() => setClicked('Alice delete')}
								/>
							</>
						}
					/>
					<ListItem
						leading={<Avatar alt="Bob" />}
						title="Bob Example"
						subtitle="Link row — automatic chevron"
						href="#list"
					/>
					<ListItem
						leading={<IcFile />}
						title="Disabled row"
						onClick={() => setClicked('never')}
						disabled
					/>
				</List>
				<p>Last click: {clicked || '—'}</p>
			</Variant>

			<Variant name="Trailing controls (divided)">
				<List variant="divided">
					<ListItem
						title="Notifications"
						subtitle="Push and e-mail"
						trailing={
							<Toggle
								aria-label="Notifications"
								checked={notify}
								onChange={(e) => setNotify(e.target.checked)}
							/>
						}
					/>
					<ListItem title="Storage" trailing={<Badge variant="soft">82%</Badge>} />
				</List>
			</Variant>

			<Variant name="Selectable (single / multiple)">
				<List variant="bordered" selectable="single" aria-label="Single choice">
					{['a', 'b', 'c'].map((id) => (
						<ListItem
							key={id}
							title={`Option ${id.toUpperCase()}`}
							selected={single === id}
							onClick={() => setSingle(id)}
						/>
					))}
				</List>
				<List variant="bordered" selectable="multiple" aria-label="Multiple choice">
					{['a', 'b', 'c'].map((id) => (
						<ListItem
							key={id}
							title={`Item ${id.toUpperCase()}`}
							selected={multi.has(id)}
							onClick={() => toggleMulti(id)}
						/>
					))}
				</List>
			</Variant>

			<Variant name="Markers">
				<List marker="bullet">
					<ListItem>Bullet one</ListItem>
					<ListItem>Bullet two</ListItem>
				</List>
				<List marker="number">
					<ListItem>First step</ListItem>
					<ListItem>Second step</ListItem>
				</List>
			</Variant>

			<Variant name="DescriptionList, Meta, IconText">
				<DescriptionList
					items={[
						{ term: 'Owner', description: 'alice.example.org' },
						{ term: 'Created', description: '2026-09-26' },
						{ term: 'Size', description: '1.2 MB' }
					]}
				/>
				<Meta>
					<span>alice.example.org</span>
					<span>3 min ago</span>
					<span>Public</span>
				</Meta>
				<IconText icon={<IcCalendar />}>Tomorrow, 10:00</IconText>
			</Variant>
		</Story>
	)
}

// vim: ts=4
