import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Panel } from '@cloudillo/react'

export function PanelStory() {
	return <Story
		name="Panel"
		description="Card/panel container component with color variants and elevation levels."
		props={[
			{ name: 'variant', type: '"primary" | "secondary" | "accent" | "error" | "warning" | "success"', descr: 'Color variant' },
			{ name: 'elevation', type: '"low" | "mid" | "high"', descr: 'Elevation level' },
			{ name: 'emph', type: 'boolean', descr: 'Emphasized state with inset shadow' }
		]}
	>
		<Variant name="Color Variants">
			<div className="c-hbox g-2 flex-wrap">
				<Panel className="p-3">Default</Panel>
				<Panel variant="primary" className="p-3">Primary</Panel>
				<Panel variant="secondary" className="p-3">Secondary</Panel>
				<Panel variant="accent" className="p-3">Accent</Panel>
				<Panel variant="error" className="p-3">Error</Panel>
				<Panel variant="warning" className="p-3">Warning</Panel>
				<Panel variant="success" className="p-3">Success</Panel>
			</div>
		</Variant>

		<Variant name="Elevation Levels">
			<div className="c-hbox g-2">
				<Panel elevation="low" className="p-3">Low</Panel>
				<Panel elevation="mid" className="p-3">Mid</Panel>
				<Panel elevation="high" className="p-3">High</Panel>
			</div>
		</Variant>

		<Variant name="Emphasized">
			<div className="c-hbox g-2">
				<Panel emph className="p-3">Emphasized</Panel>
				<Panel variant="primary" emph className="p-3">Primary Emph</Panel>
			</div>
		</Variant>

		<Variant name="Card Example">
			<Panel className="p-3" style={{ maxWidth: '300px' }}>
				<h3 className="mt-0">Card Title</h3>
				<p>This is a card with some content. Panels are great for grouping related content together.</p>
				<button className="c-button primary">Action</button>
			</Panel>
		</Variant>
	</Story>
}

// vim: ts=4
