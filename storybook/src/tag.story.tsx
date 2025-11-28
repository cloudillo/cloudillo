import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Tag, TagList } from '@cloudillo/react'

export function TagStory() {
	const [tags, setTags] = React.useState(['React', 'TypeScript', 'CSS'])

	return <Story
		name="Tag"
		description="Tag/label component for displaying keywords, categories, or removable items."
		props={[
			{ name: 'variant', type: '"primary" | "secondary" | "accent" | "error" | "warning" | "success"', descr: 'Color variant' },
			{ name: 'size', type: '"small" | "default" | "large"', descr: 'Tag size' },
			{ name: 'onRemove', type: '() => void', descr: 'Callback when remove button is clicked (shows remove button)' }
		]}
	>
		<Variant name="Basic Tags">
			<TagList>
				<Tag>#cloudillo</Tag>
				<Tag>#react</Tag>
				<Tag>#typescript</Tag>
			</TagList>
		</Variant>

		<Variant name="Color Variants">
			<TagList>
				<Tag>Default</Tag>
				<Tag variant="primary">Primary</Tag>
				<Tag variant="secondary">Secondary</Tag>
				<Tag variant="accent">Accent</Tag>
				<Tag variant="success">Success</Tag>
				<Tag variant="warning">Warning</Tag>
				<Tag variant="error">Error</Tag>
			</TagList>
		</Variant>

		<Variant name="Sizes">
			<div className="c-hbox g-2 align-items-center">
				<Tag size="small">Small</Tag>
				<Tag>Default</Tag>
				<Tag size="large">Large</Tag>
			</div>
		</Variant>

		<Variant name="Removable Tags">
			<TagList>
				{tags.map(tag => (
					<Tag key={tag} onRemove={() => setTags(t => t.filter(x => x !== tag))}>
						{tag}
					</Tag>
				))}
			</TagList>
			{tags.length === 0 && (
				<button className="c-button small" onClick={() => setTags(['React', 'TypeScript', 'CSS'])}>
					Reset Tags
				</button>
			)}
		</Variant>
	</Story>
}

// vim: ts=4
