import { Avatar, ColorDot, HBox, Tag } from '@cloudillo/react'
import * as React from 'react'
import { LuHash as IcHash } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

const FILTERS = ['All', 'Documents', 'Images', 'Videos']
const REACTIONS = [
	{ icon: '👍', count: 3 },
	{ icon: '❤️', count: 1 },
	{ icon: '🎉', count: 5 }
]
const PALETTE = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']

export function TagStory() {
	const [tags, setTags] = React.useState(['React', 'TypeScript', 'CSS'])
	const [filter, setFilter] = React.useState('All')
	const [mine, setMine] = React.useState<string | undefined>('👍')

	return (
		<Story
			name="Tag"
			description="The chip. Static, clickable (onClick/href + pressed), menu trigger (caret) or removable (onRemove) — the two interactive groups are mutually exclusive. ColorDot is shown here too."
			props={[
				{ name: 'color', type: 'ColorVariant', descr: 'Tone' },
				{ name: 'size', type: 'Size', descr: 'Tag size' },
				{ name: 'icon', type: 'ReactNode', descr: 'Leading icon or emoji' },
				{ name: 'avatar', type: 'ReactNode', descr: 'Leading avatar' },
				{ name: 'count', type: 'number', descr: 'Trailing counter' },
				{
					name: 'onClick / href',
					type: '(e) => void / string',
					descr: 'Renders a button / link'
				},
				{ name: 'pressed', type: 'boolean', descr: 'Toggle state (aria-pressed)' },
				{ name: 'caret', type: 'boolean', descr: 'Dropdown caret for a Menu trigger' },
				{
					name: 'onRemove',
					type: '() => void',
					descr: 'Remove button labelled "Remove {label}"'
				},
				{ name: 'removeLabel', type: 'string', descr: 'Overrides the remove label' },
				{
					name: 'ColorDot color',
					type: 'string',
					descr: 'User-chosen colour only (tone dots are Badge dot)'
				}
			]}
		>
			<Variant name="Static">
				<HBox gap={1} wrap>
					<Tag icon={<IcHash />}>cloudillo</Tag>
					<Tag color="primary">Primary</Tag>
					<Tag color="success">Success</Tag>
					<Tag color="error">Error</Tag>
					<Tag size="sm">Small</Tag>
					<Tag size="lg">Large</Tag>
				</HBox>
			</Variant>

			<Variant name="Filter Toggle (pressed)">
				<HBox gap={1} wrap>
					{FILTERS.map((f) => (
						<Tag key={f} pressed={filter === f} onClick={() => setFilter(f)}>
							{f}
						</Tag>
					))}
				</HBox>
			</Variant>

			<Variant name="Reactions (icon + count)">
				<HBox gap={1} wrap>
					{REACTIONS.map((r) => (
						<Tag
							key={r.icon}
							icon={r.icon}
							count={r.count + (mine === r.icon ? 1 : 0)}
							pressed={mine === r.icon}
							onClick={() => setMine(mine === r.icon ? undefined : r.icon)}
						/>
					))}
				</HBox>
			</Variant>

			<Variant name="Link, Avatar, Caret">
				<HBox gap={1} wrap>
					<Tag href="#tag-cloud" icon={<IcHash />}>
						design
					</Tag>
					<Tag avatar={<Avatar size="xs" alt="Alice" />} onClick={() => {}}>
						Alice
					</Tag>
					<Tag caret onClick={() => {}}>
						Sort: newest
					</Tag>
				</HBox>
			</Variant>

			<Variant name="Removable">
				<HBox gap={1} wrap>
					{tags.map((tag) => (
						<Tag key={tag} onRemove={() => setTags((t) => t.filter((x) => x !== tag))}>
							{tag}
						</Tag>
					))}
					{tags.length === 0 && (
						<Tag onClick={() => setTags(['React', 'TypeScript', 'CSS'])}>Reset</Tag>
					)}
				</HBox>
			</Variant>

			<Variant name="ColorDot">
				<HBox gap={2} className="align-items-center">
					{PALETTE.map((c) => (
						<ColorDot key={c} color={c} aria-label={c} />
					))}
					<ColorDot color="teal" size="sm" />
					<ColorDot color="teal" size="lg" />
				</HBox>
			</Variant>
		</Story>
	)
}

// vim: ts=4
