import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Nav, NavGroup, NavItem, NavLink } from '@cloudillo/react'
import {
	LuHouse as IcHome,
	LuSettings as IcSettings,
	LuUser as IcUser,
	LuFolder as IcFolder
} from 'react-icons/lu'

export function NavStory() {
	const [activeItem, setActiveItem] = React.useState('home')

	return <Story
		name="Nav"
		description="Navigation component system with Nav, NavGroup, NavItem, and NavLink for building menus and navigation bars."
		props={[
			{ name: 'as', type: '"nav" | "ul" | "div"', descr: 'Nav/NavGroup: HTML element to render' },
			{ name: 'vertical', type: 'boolean', descr: 'Nav/NavGroup: vertical layout' },
			{ name: 'elevation', type: '"low" | "mid" | "high"', descr: 'Nav: elevation level' },
			{ name: 'emph', type: 'boolean', descr: 'Nav: emphasized state' },
			{ name: 'active', type: 'boolean', descr: 'NavItem/NavLink: active state' },
			{ name: 'disabled', type: 'boolean', descr: 'NavItem: disabled state' },
			{ name: 'gap', type: '0 | 1 | 2 | 3', descr: 'NavGroup/NavItem: gap between items' }
		]}
	>
		<Variant name="Horizontal Nav">
			<Nav>
				<NavGroup gap={1}>
					<NavItem active={activeItem === 'home'} onClick={() => setActiveItem('home')}>
						<IcHome/> Home
					</NavItem>
					<NavItem active={activeItem === 'profile'} onClick={() => setActiveItem('profile')}>
						<IcUser/> Profile
					</NavItem>
					<NavItem active={activeItem === 'files'} onClick={() => setActiveItem('files')}>
						<IcFolder/> Files
					</NavItem>
					<NavItem active={activeItem === 'settings'} onClick={() => setActiveItem('settings')}>
						<IcSettings/> Settings
					</NavItem>
				</NavGroup>
			</Nav>
		</Variant>

		<Variant name="Vertical Nav">
			<Nav vertical emph style={{ width: '200px' }}>
				<NavGroup vertical>
					<NavItem active gap={2}><IcHome/> Home</NavItem>
					<NavItem gap={2}><IcUser/> Profile</NavItem>
					<NavItem gap={2}><IcFolder/> Files</NavItem>
					<NavItem gap={2}><IcSettings/> Settings</NavItem>
				</NavGroup>
			</Nav>
		</Variant>

		<Variant name="Elevation Levels">
			<div className="c-vbox g-2">
				<Nav elevation="low">
					<NavGroup>
						<NavItem>Low Elevation</NavItem>
					</NavGroup>
				</Nav>
				<Nav elevation="mid">
					<NavGroup>
						<NavItem>Mid Elevation</NavItem>
					</NavGroup>
				</Nav>
				<Nav elevation="high">
					<NavGroup>
						<NavItem>High Elevation</NavItem>
					</NavGroup>
				</Nav>
			</div>
		</Variant>

		<Variant name="With Disabled Items">
			<Nav>
				<NavGroup gap={1}>
					<NavItem>Active Item</NavItem>
					<NavItem disabled>Disabled Item</NavItem>
					<NavItem>Another Item</NavItem>
				</NavGroup>
			</Nav>
		</Variant>

		<Variant name="Nav Links">
			<Nav>
				<NavGroup gap={1}>
					<NavLink href="#home" active>Home</NavLink>
					<NavLink href="#about">About</NavLink>
					<NavLink href="#contact">Contact</NavLink>
				</NavGroup>
			</Nav>
		</Variant>
	</Story>
}

// vim: ts=4
