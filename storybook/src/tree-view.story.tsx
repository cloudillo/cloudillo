// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Story, Variant } from './storybook.js'
import { TreeView, TreeItem, Button } from '@cloudillo/react'
import { LuFolder, LuFile, LuPlus, LuEllipsisVertical } from 'react-icons/lu'

type Node = {
	id: string
	label: string
	icon?: React.ReactNode
	children?: Node[]
}

const sampleTree: Node[] = [
	{
		id: 'docs',
		label: 'Documents',
		icon: <LuFolder />,
		children: [
			{ id: 'doc-1', label: 'Proposal.pdf', icon: <LuFile /> },
			{ id: 'doc-2', label: 'Notes.md', icon: <LuFile /> }
		]
	},
	{
		id: 'media',
		label: 'Media',
		icon: <LuFolder />,
		children: [
			{
				id: 'photos',
				label: 'Photos',
				icon: <LuFolder />,
				children: [
					{ id: 'p-1', label: 'beach.jpg', icon: <LuFile /> },
					{ id: 'p-2', label: 'sunset.jpg', icon: <LuFile /> }
				]
			},
			{ id: 'video', label: 'clip.mp4', icon: <LuFile /> }
		]
	},
	{ id: 'readme', label: 'README.md', icon: <LuFile /> }
]

function RecursiveItem({
	node,
	depth,
	expanded,
	selected,
	onToggle,
	onSelect,
	withActions
}: {
	node: Node
	depth: number
	expanded: Set<string>
	selected: string | null
	onToggle: (id: string) => void
	onSelect: (id: string) => void
	withActions?: boolean
}) {
	const hasChildren = !!node.children?.length
	const isExpanded = expanded.has(node.id)
	return (
		<TreeItem
			id={node.id}
			depth={depth}
			hasChildren={hasChildren}
			expanded={isExpanded}
			selected={selected === node.id}
			icon={node.icon}
			label={node.label}
			onToggle={() => onToggle(node.id)}
			onSelect={() => onSelect(node.id)}
			actions={
				withActions ? (
					<Button variant="secondary" size="small" aria-label="More">
						<LuEllipsisVertical />
					</Button>
				) : undefined
			}
		>
			{hasChildren &&
				isExpanded &&
				node.children!.map((child) => (
					<RecursiveItem
						key={child.id}
						node={child}
						depth={depth + 1}
						expanded={expanded}
						selected={selected}
						onToggle={onToggle}
						onSelect={onSelect}
						withActions={withActions}
					/>
				))}
		</TreeItem>
	)
}

export function TreeViewStory() {
	const [expanded, setExpanded] = React.useState<Set<string>>(new Set(['docs', 'media']))
	const [selected, setSelected] = React.useState<string | null>('doc-1')

	function toggle(id: string) {
		setExpanded((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	return (
		<Story
			name="TreeView"
			description="Hierarchical tree with expand/collapse, selection, per-row hover actions, and built-in drag-drop support. Consumer owns state (expanded set, selected id) and renders TreeItem recursively."
			props={[
				{
					name: 'children',
					type: 'ReactNode',
					descr: 'Tree items (use TreeItem, typically recursively)'
				}
			]}
		>
			<Variant name="Basic file tree">
				<div style={{ width: 320, border: '1px solid var(--col-outline)' }}>
					<TreeView>
						{sampleTree.map((node) => (
							<RecursiveItem
								key={node.id}
								node={node}
								depth={0}
								expanded={expanded}
								selected={selected}
								onToggle={toggle}
								onSelect={setSelected}
							/>
						))}
					</TreeView>
				</div>
			</Variant>

			<Variant
				name="With row actions"
				description="Pass the `actions` prop to TreeItem — typical for notillo-style wiki pages where each row has add/more buttons."
			>
				<div style={{ width: 320, border: '1px solid var(--col-outline)' }}>
					<TreeView>
						{sampleTree.map((node) => (
							<RecursiveItem
								key={node.id}
								node={node}
								depth={0}
								expanded={expanded}
								selected={selected}
								onToggle={toggle}
								onSelect={setSelected}
								withActions
							/>
						))}
					</TreeView>
				</div>
			</Variant>

			<Variant
				name="Empty"
				description="Wrap a TreeView with an EmptyState when no nodes exist."
			>
				<div
					style={{
						width: 320,
						border: '1px solid var(--col-outline)',
						padding: 24,
						textAlign: 'center'
					}}
				>
					<LuFolder size={32} style={{ opacity: 0.4 }} />
					<p style={{ margin: '0.5rem 0' }}>No pages yet</p>
					<Button variant="primary" size="small">
						<LuPlus /> New page
					</Button>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
