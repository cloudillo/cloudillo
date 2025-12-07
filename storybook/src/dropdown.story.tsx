import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Dropdown, NavItem } from '@cloudillo/react'
import {
	LuEllipsisVertical as IcMore,
	LuChevronDown as IcChevron,
	LuPencil as IcEdit,
	LuTrash2 as IcDelete,
	LuShare2 as IcShare,
	LuCopy as IcCopy
} from 'react-icons/lu'

export function DropdownStory() {
	return (
		<Story
			name="Dropdown"
			description="Dropdown menu component using Popper.js for positioning with click-outside handling."
			props={[
				{ name: 'trigger', type: 'React.ReactNode', descr: 'Trigger element content' },
				{
					name: 'triggerClassName',
					type: 'string',
					descr: 'CSS classes for trigger element'
				},
				{ name: 'menuClassName', type: 'string', descr: 'CSS classes for menu container' },
				{
					name: 'elevation',
					type: '"low" | "mid" | "high"',
					descr: 'Menu elevation level'
				},
				{ name: 'emph', type: 'boolean', descr: 'Emphasized menu style' },
				{
					name: 'placement',
					type: '"bottom-start" | "bottom-end" | "top-start" | "top-end"',
					descr: 'Menu placement'
				}
			]}
		>
			<Variant name="Basic Dropdown">
				<Dropdown
					trigger={
						<span className="c-nav-item g-2">
							Options <IcChevron />
						</span>
					}
					emph
				>
					<NavItem gap={2}>
						<IcEdit /> Edit
					</NavItem>
					<NavItem gap={2}>
						<IcCopy /> Duplicate
					</NavItem>
					<NavItem gap={2}>
						<IcShare /> Share
					</NavItem>
					<NavItem gap={2}>
						<IcDelete /> Delete
					</NavItem>
				</Dropdown>
			</Variant>

			<Variant name="Icon Only Trigger">
				<Dropdown
					trigger={
						<span className="c-nav-item">
							<IcMore />
						</span>
					}
					emph
				>
					<NavItem>Option 1</NavItem>
					<NavItem>Option 2</NavItem>
					<NavItem>Option 3</NavItem>
				</Dropdown>
			</Variant>

			<Variant name="Different Placements">
				<div className="c-hbox g-3">
					<Dropdown
						trigger={<span className="c-button">Bottom Start</span>}
						placement="bottom-start"
						emph
					>
						<NavItem>Item 1</NavItem>
						<NavItem>Item 2</NavItem>
					</Dropdown>
					<Dropdown
						trigger={<span className="c-button">Bottom End</span>}
						placement="bottom-end"
						emph
					>
						<NavItem>Item 1</NavItem>
						<NavItem>Item 2</NavItem>
					</Dropdown>
				</div>
			</Variant>

			<Variant name="With Elevation">
				<div className="c-hbox g-3">
					<Dropdown trigger={<span className="c-button">Low</span>} elevation="low">
						<NavItem>Low elevation menu</NavItem>
					</Dropdown>
					<Dropdown trigger={<span className="c-button">High</span>} elevation="high">
						<NavItem>High elevation menu</NavItem>
					</Dropdown>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
