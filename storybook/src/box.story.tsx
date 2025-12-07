import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { HBox, VBox, Group } from '@cloudillo/react'

export function BoxStory() {
	return (
		<Story
			name="Box"
			description="Flexbox layout components for horizontal (HBox), vertical (VBox), and grouped layouts."
			props={[
				{ name: 'wrap', type: 'boolean', descr: 'Enable flex wrap' },
				{ name: 'gap', type: '0 | 1 | 2 | 3', descr: 'Gap size between children' },
				{ name: 'fill', type: 'boolean', descr: 'VBox only: flex: 1 to fill space' }
			]}
		>
			<Variant name="HBox (Horizontal)">
				<HBox gap={2} className="c-panel p-3">
					<div className="c-panel primary p-2">Item 1</div>
					<div className="c-panel secondary p-2">Item 2</div>
					<div className="c-panel accent p-2">Item 3</div>
				</HBox>
			</Variant>

			<Variant name="HBox with Wrap">
				<HBox wrap gap={1} className="c-panel p-3" style={{ maxWidth: '300px' }}>
					<div className="c-panel primary p-2">Item 1</div>
					<div className="c-panel secondary p-2">Item 2</div>
					<div className="c-panel accent p-2">Item 3</div>
					<div className="c-panel success p-2">Item 4</div>
					<div className="c-panel warning p-2">Item 5</div>
				</HBox>
			</Variant>

			<Variant name="VBox (Vertical)">
				<VBox gap={2} className="c-panel p-3">
					<div className="c-panel primary p-2">Item 1</div>
					<div className="c-panel secondary p-2">Item 2</div>
					<div className="c-panel accent p-2">Item 3</div>
				</VBox>
			</Variant>

			<Variant name="VBox with Fill">
				<VBox gap={2} className="c-panel p-3" style={{ height: '200px' }}>
					<div className="c-panel primary p-2">Header</div>
					<VBox fill className="c-panel secondary p-2">
						Content (fills remaining space)
					</VBox>
					<div className="c-panel accent p-2">Footer</div>
				</VBox>
			</Variant>

			<Variant name="Group">
				<Group>
					<button className="c-button primary">Button 1</button>
					<button className="c-button secondary">Button 2</button>
					<button className="c-button accent">Button 3</button>
				</Group>
			</Variant>
		</Story>
	)
}

// vim: ts=4
