// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, TreeItem, TreeView } from '@cloudillo/react'
import * as React from 'react'
import { LuEllipsisVertical, LuFile, LuFolder, LuPlus } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

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
					<Button color="secondary" size="sm" aria-label="More">
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

type Position = 'before' | 'after' | 'inside'

/** Removes `id` from the tree, then reinserts it relative to `targetId` */
function moveNode(tree: Node[], id: string, targetId: string, position: Position): Node[] {
	let moved: Node | undefined
	const without = (nodes: Node[]): Node[] =>
		nodes.flatMap((n) => {
			if (n.id === id) {
				moved = n
				return []
			}
			return [{ ...n, children: n.children && without(n.children) }]
		})
	const insert = (nodes: Node[]): Node[] =>
		nodes.flatMap((n) => {
			if (n.id !== targetId || !moved) {
				return [{ ...n, children: n.children && insert(n.children) }]
			}
			if (position === 'inside') return [{ ...n, children: [...(n.children ?? []), moved] }]
			return position === 'before' ? [moved, n] : [n, moved]
		})
	const rest = without(tree)
	return moved ? insert(rest) : tree
}

export function TreeViewStory() {
	const [expanded, setExpanded] = React.useState<Set<string>>(new Set(['docs', 'media']))
	const [selected, setSelected] = React.useState<string | null>('doc-1')
	const [tree, setTree] = React.useState(sampleTree)

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
			description="Hierarchical tree with expand/collapse, selection, per-row hover actions, and drag-to-move via `onMove` (pointer, or Space on a focused row then arrow keys). Consumer owns state (expanded set, selected id) and renders TreeItem recursively."
			props={[
				{
					name: 'children',
					type: 'ReactNode',
					descr: 'Tree items (use TreeItem, typically recursively)'
				},
				{
					name: 'onMove',
					type: "(id, targetId, position: 'before' | 'after' | 'inside') => void",
					descr: 'Enables drag of every TreeItem (opt out with isDraggable={false}); called on drop'
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
				name="Drag to move (onMove)"
				description="Drop on the upper/lower quarter of a folder row to place before/after it, on its middle to move inside. Folders carry allowDropInside via hasChildren."
			>
				<div style={{ width: 320, border: '1px solid var(--col-outline)' }}>
					<TreeView
						onMove={(id, target, pos) => setTree((t) => moveNode(t, id, target, pos))}
					>
						{tree.map((node) => (
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
					<Button color="primary" size="sm">
						<LuPlus /> New page
					</Button>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
