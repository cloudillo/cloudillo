import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Badge } from '@cloudillo/react'

export function BadgeStory() {
	return <Story
		name="Badge"
		description="Badge/pill component for displaying counts, status, or labels."
		props={[
			{ name: 'variant', type: '"primary" | "secondary" | "accent" | "error" | "warning" | "success"', descr: 'Color variant' },
			{ name: 'rounded', type: 'boolean', descr: 'Fully rounded pill style' }
		]}
	>
		<Variant name="Color Variants">
			<div className="c-hbox g-2">
				<Badge>Default</Badge>
				<Badge variant="primary">Primary</Badge>
				<Badge variant="secondary">Secondary</Badge>
				<Badge variant="accent">Accent</Badge>
				<Badge variant="error">Error</Badge>
				<Badge variant="warning">Warning</Badge>
				<Badge variant="success">Success</Badge>
			</div>
		</Variant>

		<Variant name="Rounded (Pill)">
			<div className="c-hbox g-2">
				<Badge rounded variant="primary">5</Badge>
				<Badge rounded variant="error">99+</Badge>
				<Badge rounded variant="success">New</Badge>
			</div>
		</Variant>

		<Variant name="In Context">
			<div className="c-hbox g-2">
				<button className="c-nav-item pos-relative">
					Notifications
					<Badge rounded variant="error" className="pos-absolute top-0 right-0">3</Badge>
				</button>
			</div>
		</Variant>
	</Story>
}

// vim: ts=4
