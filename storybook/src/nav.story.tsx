import { Badge, Nav } from '@cloudillo/react'
import * as React from 'react'
import {
	LuBell as IcBell,
	LuFolder as IcFolder,
	LuHouse as IcHome,
	LuSettings as IcSettings,
	LuShield as IcShield,
	LuUser as IcUser
} from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function NavStory() {
	const [activeItem, setActiveItem] = React.useState('home')

	return (
		<Story
			name="Nav"
			description="Compound navigation menu: <Nav> + Nav.Section / Nav.Item / Nav.Divider, rendered as <nav><ul><li>. Router hrefs get aria-current from the current route. NavItem is deprecated."
			props={[
				{ name: 'aria-label', type: 'string', descr: 'Nav: accessible name of the menu' },
				{
					name: 'orientation',
					type: '"vertical" | "horizontal"',
					descr: 'Nav: layout (default: vertical)'
				},
				{ name: 'size', type: 'Size', descr: 'Nav: text size' },
				{ name: 'elevation', type: '"low" | "mid" | "high"', descr: 'Nav: background' },
				{ name: 'label', type: 'ReactNode', descr: 'Nav.Section: heading; Nav.Item: text' },
				{
					name: 'href',
					type: 'string',
					descr: 'Nav.Item: "/…" → router link, active when the route matches exactly'
				},
				{ name: 'onClick', type: '(evt) => void', descr: 'Nav.Item: button item' },
				{ name: 'icon', type: 'ReactNode', descr: 'Nav.Item: leading icon' },
				{ name: 'badge', type: 'ReactNode', descr: 'Nav.Item: trailing node (Badge)' },
				{ name: 'count', type: 'number', descr: 'Nav.Item: muted trailing count' },
				{ name: 'depth', type: 'number', descr: 'Nav.Item: indent level' },
				{ name: 'active', type: 'boolean', descr: 'Nav.Item: overrides router state' },
				{ name: 'disabled', type: 'boolean', descr: 'Nav.Item: disabled' }
			]}
		>
			<Variant name="Settings sidebar (router links)">
				<Nav aria-label="Settings" elevation="low" style={{ width: 240 }}>
					<Nav.Section label="Account">
						<Nav.Item href="/" icon={<IcHome />} label="Home (active on /)" />
						<Nav.Item href="/profile" icon={<IcUser />} label="Profile" />
						<Nav.Item href="/security" icon={<IcShield />} label="Security" />
					</Nav.Section>
					<Nav.Divider />
					<Nav.Section label="Preferences">
						<Nav.Item
							href="/notifications"
							icon={<IcBell />}
							label="Notifications"
							badge={<Badge color="error">3</Badge>}
						/>
						<Nav.Item href="/files" icon={<IcFolder />} label="Files" count={42} />
						<Nav.Item href="/files/shared" label="Shared" depth={1} count={5} />
						<Nav.Item icon={<IcSettings />} label="Advanced" disabled />
					</Nav.Section>
				</Nav>
			</Variant>

			<Variant name="Button items (filter)">
				<Nav aria-label="Filter" style={{ width: 220 }}>
					{(['home', 'profile', 'files'] as const).map((key) => (
						<Nav.Item
							key={key}
							label={key[0].toUpperCase() + key.slice(1)}
							active={activeItem === key}
							onClick={() => setActiveItem(key)}
						/>
					))}
				</Nav>
			</Variant>

			<Variant name="Horizontal">
				<Nav aria-label="Sections" orientation="horizontal" size="sm">
					<Nav.Item href="/" icon={<IcHome />} label="Home" />
					<Nav.Item href="/profile" icon={<IcUser />} label="Profile" />
					<Nav.Divider />
					<Nav.Item href="/files" icon={<IcFolder />} label="Files" count={7} />
				</Nav>
			</Variant>
		</Story>
	)
}

// vim: ts=4
