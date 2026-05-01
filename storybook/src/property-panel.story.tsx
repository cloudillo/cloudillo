// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Story, Variant } from './storybook.js'
import { PropertyPanel, PropertySection, PropertyField, Input, NumberInput } from '@cloudillo/react'

export function PropertyPanelStory() {
	const [name, setName] = React.useState('Untitled')
	const [width, setWidth] = React.useState(320)
	const [height, setHeight] = React.useState(240)
	const [color, setColor] = React.useState('#4a90e2')

	return (
		<Story
			name="PropertyPanel"
			description="Right-side properties panel for inspecting/editing the selected object. Canonical pattern for canvas editors (prezillo, ideallo) and structured content (notillo). Composed of PropertyPanel → PropertySection → PropertyField."
			props={[
				{
					name: 'width',
					type: 'number',
					descr: 'Fixed panel width in pixels (default 280)'
				},
				{ name: 'className', type: 'string', descr: 'Additional classes' }
			]}
		>
			<Variant name="Default (280px)">
				<div style={{ height: 400, display: 'flex' }}>
					<div
						className="flex-fill"
						style={{ background: 'var(--col-container-low)', padding: '1rem' }}
					>
						<p>Main content area — a canvas or list would live here.</p>
					</div>
					<PropertyPanel>
						<PropertySection title="General">
							<PropertyField label="Name">
								<Input value={name} onChange={(e) => setName(e.target.value)} />
							</PropertyField>
						</PropertySection>
						<PropertySection title="Size">
							<PropertyField label="Width">
								<NumberInput value={width} onChange={setWidth} suffix="px" />
							</PropertyField>
							<PropertyField label="Height">
								<NumberInput value={height} onChange={setHeight} suffix="px" />
							</PropertyField>
						</PropertySection>
						<PropertySection title="Appearance" defaultExpanded={false}>
							<PropertyField label="Color">
								<Input
									type="color"
									value={color}
									onChange={(e) => setColor(e.target.value)}
								/>
							</PropertyField>
						</PropertySection>
					</PropertyPanel>
				</div>
			</Variant>

			<Variant
				name="Narrow (240px)"
				description="For apps with less space — pass width={240}."
			>
				<div style={{ height: 280, display: 'flex' }}>
					<div
						className="flex-fill"
						style={{ background: 'var(--col-container-low)', padding: '1rem' }}
					>
						<p>Canvas…</p>
					</div>
					<PropertyPanel width={240}>
						<PropertySection title="Position">
							<PropertyField label="X">
								<NumberInput value={100} onChange={() => {}} suffix="px" />
							</PropertyField>
							<PropertyField label="Y">
								<NumberInput value={50} onChange={() => {}} suffix="px" />
							</PropertyField>
						</PropertySection>
					</PropertyPanel>
				</div>
			</Variant>

			<Variant
				name="Sections with default collapse"
				description="Use defaultExpanded={false} for rarely-used sections so the panel stays scannable."
			>
				<PropertyPanel>
					<PropertySection title="Common">
						<PropertyField label="Label">
							<Input defaultValue="Primary" />
						</PropertyField>
					</PropertySection>
					<PropertySection title="Advanced" defaultExpanded={false}>
						<PropertyField label="Locked">
							<Input type="checkbox" />
						</PropertyField>
						<PropertyField label="Hidden">
							<Input type="checkbox" />
						</PropertyField>
					</PropertySection>
					<PropertySection title="Meta" defaultExpanded={false}>
						<PropertyField label="ID">
							<Input defaultValue="obj-42" readOnly />
						</PropertyField>
					</PropertySection>
				</PropertyPanel>
			</Variant>
		</Story>
	)
}

// vim: ts=4
