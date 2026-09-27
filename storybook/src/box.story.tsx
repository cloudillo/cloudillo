import { Affix, Center, Grid, Group, HBox, Spacer, Switcher, VBox } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

function Item({ color = 'primary', children }: { color?: string; children: React.ReactNode }) {
	return <div className={`c-panel ${color} p-2`}>{children}</div>
}

export function BoxStory() {
	return (
		<Story
			name="Box"
			description="Flexbox layout components for horizontal (HBox), vertical (VBox), and grouped layouts, plus Spacer, Grid, Switcher, Center and Affix."
			props={[
				{ name: 'gap', type: '0 | 1 | 2 | 3 | 4 | 5', descr: 'Gap between children' },
				{ name: 'padding', type: '0 | 1 | 2 | 3 | 4 | 5', descr: 'Inner padding' },
				{
					name: 'align',
					type: "'start' | 'center' | 'end' | 'stretch' | 'baseline'",
					descr: 'Cross-axis alignment'
				},
				{
					name: 'justify',
					type: "'start' | 'center' | 'end' | 'between'",
					descr: 'Main-axis distribution'
				},
				{ name: 'wrap', type: 'boolean', descr: 'Enable flex wrap' },
				{ name: 'fill', type: 'boolean', descr: 'flex: 1 + zero min size inside a box' },
				{ name: 'scroll', type: 'boolean', descr: 'overflow: auto on the main axis' },
				{ name: 'reverse', type: 'boolean', descr: 'Reverse the main axis' }
			]}
		>
			<Variant name="HBox (Horizontal)">
				<HBox gap={2} padding={3}>
					<Item>Item 1</Item>
					<Item color="secondary">Item 2</Item>
					<Item color="accent">Item 3</Item>
				</HBox>
			</Variant>

			<Variant name="HBox with Wrap">
				<HBox wrap gap={1} padding={3} style={{ maxWidth: '300px' }}>
					<Item>Item 1</Item>
					<Item color="secondary">Item 2</Item>
					<Item color="accent">Item 3</Item>
					<Item color="success">Item 4</Item>
					<Item color="warning">Item 5</Item>
				</HBox>
			</Variant>

			<Variant name="HBox align / justify / reverse">
				<VBox gap={2}>
					<HBox gap={2} align="baseline" justify="between">
						<Item>Start</Item>
						<Item color="secondary">End</Item>
					</HBox>
					<HBox gap={2} reverse>
						<Item>1</Item>
						<Item color="secondary">2</Item>
						<Item color="accent">3</Item>
					</HBox>
				</VBox>
			</Variant>

			<Variant name="Spacer">
				<HBox gap={2} align="center">
					<Item>Left</Item>
					<Spacer />
					<Item color="secondary">Right</Item>
				</HBox>
			</Variant>

			<Variant name="VBox (Vertical)">
				<VBox gap={2} padding={3}>
					<Item>Item 1</Item>
					<Item color="secondary">Item 2</Item>
					<Item color="accent">Item 3</Item>
				</VBox>
			</Variant>

			<Variant name="VBox with Fill and Scroll">
				<VBox gap={2} padding={3} style={{ height: '200px' }}>
					<Item>Header</Item>
					<VBox fill scroll gap={1}>
						{Array.from({ length: 10 }, (_, i) => (
							<Item key={i} color="secondary">
								Row {i + 1}
							</Item>
						))}
					</VBox>
					<Item color="accent">Footer</Item>
				</VBox>
			</Variant>

			<Variant name="Grid (min 10rem)">
				<Grid min="10rem" gap={2}>
					{['A', 'B', 'C', 'D', 'E'].map((l) => (
						<Item key={l}>{l}</Item>
					))}
				</Grid>
			</Variant>

			<Variant name="Switcher (threshold 25rem)">
				<Switcher threshold="25rem" gap={2}>
					<Item>One</Item>
					<Item color="secondary">Two</Item>
					<Item color="accent">Three</Item>
				</Switcher>
			</Variant>

			<Variant name="Center">
				<Center text style={{ minHeight: '8rem' }}>
					<Item>Centered</Item>
				</Center>
			</Variant>

			<Variant name="Affix (sticky, in a scroll box)">
				<div style={{ height: '10rem', overflow: 'auto' }}>
					<Affix mode="sticky" position="top-end" offset={2}>
						<Item color="accent">Pinned</Item>
					</Affix>
					<VBox gap={1} padding={2}>
						{Array.from({ length: 12 }, (_, i) => (
							<Item key={i}>Content {i + 1}</Item>
						))}
					</VBox>
				</div>
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
