import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Tabs, Tab, Panel } from '@cloudillo/react'

export function TabStory() {
	const [activeTab, setActiveTab] = React.useState('tab1')

	return <Story
		name="Tab"
		description="Tab navigation component with Tabs container and Tab items for creating tabbed interfaces."
		props={[
			{ name: 'value', type: 'string', descr: 'Tabs: currently selected tab value' },
			{ name: 'onTabChange', type: '(value: string) => void', descr: 'Tabs: callback when tab changes' },
			{ name: 'value', type: 'string', descr: 'Tab: unique value for this tab' },
			{ name: 'active', type: 'boolean', descr: 'Tab: manually set active state' },
			{ name: 'variant', type: 'ColorVariant', descr: 'Tab: color variant' },
			{ name: 'as', type: '"button" | "a"', descr: 'Tab: render as button or link' },
			{ name: 'href', type: 'string', descr: 'Tab: URL when rendered as link' }
		]}
	>
		<Variant name="Basic Tabs">
			<div>
				<Tabs value={activeTab} onTabChange={setActiveTab}>
					<Tab value="tab1">Tab 1</Tab>
					<Tab value="tab2">Tab 2</Tab>
					<Tab value="tab3">Tab 3</Tab>
				</Tabs>
				<Panel className="p-3 mt-2">
					{activeTab === 'tab1' && <div>Content for Tab 1</div>}
					{activeTab === 'tab2' && <div>Content for Tab 2</div>}
					{activeTab === 'tab3' && <div>Content for Tab 3</div>}
				</Panel>
			</div>
		</Variant>

		<Variant name="Color Variants">
			<Tabs>
				<Tab active>Default</Tab>
				<Tab variant="primary">Primary</Tab>
				<Tab variant="secondary">Secondary</Tab>
				<Tab variant="accent">Accent</Tab>
			</Tabs>
		</Variant>

		<Variant name="Standalone Tabs (Uncontrolled)">
			<Tabs>
				<Tab active>Active Tab</Tab>
				<Tab>Tab 2</Tab>
				<Tab>Tab 3</Tab>
			</Tabs>
		</Variant>

		<Variant name="Tab Links">
			<Tabs>
				<Tab as="a" href="#section1" active>Section 1</Tab>
				<Tab as="a" href="#section2">Section 2</Tab>
				<Tab as="a" href="#section3">Section 3</Tab>
			</Tabs>
		</Variant>
	</Story>
}

// vim: ts=4
