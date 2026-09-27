import { Panel, Tab, Tabs } from '@cloudillo/react'
import * as React from 'react'
import { LuFile, LuHouse, LuUser } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function TabStory() {
	const [activeTab, setActiveTab] = React.useState('tab1')

	return (
		<Story
			name="Tab"
			description="Tab navigation component with Tabs container and Tab items for creating tabbed interfaces."
			props={[
				{ name: 'value', type: 'string', descr: 'Tabs: currently selected tab value' },
				{
					name: 'onTabChange',
					type: '(value: string) => void',
					descr: 'Tabs: callback when tab changes'
				},
				{ name: 'value', type: 'string', descr: 'Tab: unique value for this tab' },
				{ name: 'active', type: 'boolean', descr: 'Tab: manually set active state' },
				{ name: 'color', type: 'ColorVariant', descr: 'Tab: color' },
				{ name: 'as', type: '"button" | "a"', descr: 'Tab: render as button or link' },
				{
					name: 'href',
					type: 'string',
					descr: 'Tab: URL; "/…" (without as) → router link, active when the route matches'
				},
				{ name: 'icon', type: 'ReactNode', descr: 'Tab: leading icon' },
				{ name: 'count', type: 'number', descr: 'Tab: muted trailing count' },
				{ name: 'wrap', type: 'boolean', descr: 'Tabs: wrap onto more lines' }
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
					<Tab color="primary">Primary</Tab>
					<Tab color="secondary">Secondary</Tab>
					<Tab color="accent">Accent</Tab>
				</Tabs>
			</Variant>

			<Variant name="Standalone Tabs (Uncontrolled)">
				<Tabs>
					<Tab active>Active Tab</Tab>
					<Tab>Tab 2</Tab>
					<Tab>Tab 3</Tab>
				</Tabs>
			</Variant>

			<Variant name="Icons and counts">
				<Tabs value={activeTab} onTabChange={setActiveTab}>
					<Tab value="tab1" icon={<LuHouse />}>
						Home
					</Tab>
					<Tab value="tab2" icon={<LuFile />} count={12}>
						Files
					</Tab>
					<Tab value="tab3" icon={<LuUser />} count={3}>
						People
					</Tab>
				</Tabs>
			</Variant>

			<Variant name="Router tabs (href)">
				<Tabs>
					<Tab href="/">Home (active on /)</Tab>
					<Tab href="/profile">Profile</Tab>
					<Tab href="/files">Files</Tab>
				</Tabs>
			</Variant>

			<Variant name="Wrapping">
				<Tabs wrap style={{ maxWidth: 280 }}>
					{[
						'Overview',
						'Activity',
						'Members',
						'Permissions',
						'Integrations',
						'Billing'
					].map((label, i) => (
						<Tab key={label} active={i === 0}>
							{label}
						</Tab>
					))}
				</Tabs>
			</Variant>

			<Variant name="Tab Links">
				<Tabs>
					<Tab as="a" href="#section1" active>
						Section 1
					</Tab>
					<Tab as="a" href="#section2">
						Section 2
					</Tab>
					<Tab as="a" href="#section3">
						Section 3
					</Tab>
				</Tabs>
			</Variant>
		</Story>
	)
}

// vim: ts=4
