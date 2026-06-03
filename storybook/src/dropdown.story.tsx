// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Dropdown } from '@cloudillo/react'
import * as React from 'react'
import {
	LuChevronDown as IcChevron,
	LuCopy as IcCopy,
	LuTrash2 as IcDelete,
	LuPencil as IcEdit,
	LuEllipsisVertical as IcMore,
	LuShare2 as IcShare
} from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function DropdownStory() {
	return (
		<Story
			name="Dropdown"
			description="Popper-based dropdown menu (uses `c-popper` for the floating menu). Triggers are bare — style them with `triggerClassName` or by passing a styled element as `trigger`."
			props={[
				{ name: 'trigger', type: 'React.ReactNode', descr: 'Trigger element content' },
				{
					name: 'triggerClassName',
					type: 'string',
					descr: 'CSS classes applied to the <summary> trigger'
				},
				{
					name: 'menuClassName',
					type: 'string',
					descr: 'Extra CSS classes for the popper menu'
				},
				{
					name: 'elevation',
					type: '"low" | "mid" | "high"',
					descr: 'Menu elevation (defaults to "high")'
				},
				{
					name: 'placement',
					type: '"bottom-start" | "bottom-end" | "top-start" | "top-end"',
					descr: 'Popper placement'
				}
			]}
		>
			<Variant name="Basic Dropdown">
				<Dropdown
					triggerClassName="c-button"
					trigger={
						<>
							Options <IcChevron />
						</>
					}
				>
					<ul className="c-nav vertical emph">
						<li>
							<Button kind="nav-item">
								<IcEdit /> Edit
							</Button>
						</li>
						<li>
							<Button kind="nav-item">
								<IcCopy /> Duplicate
							</Button>
						</li>
						<li>
							<Button kind="nav-item">
								<IcShare /> Share
							</Button>
						</li>
						<li>
							<hr className="my-1" />
						</li>
						<li>
							<Button kind="nav-item">
								<IcDelete style={{ color: 'var(--col-error)' }} /> Delete
							</Button>
						</li>
					</ul>
				</Dropdown>
			</Variant>

			<Variant name="Icon-only Trigger">
				<Dropdown triggerClassName="c-button icon" trigger={<IcMore />}>
					<ul className="c-nav vertical emph">
						<li>
							<Button kind="nav-item">Option 1</Button>
						</li>
						<li>
							<Button kind="nav-item">Option 2</Button>
						</li>
						<li>
							<Button kind="nav-item">Option 3</Button>
						</li>
					</ul>
				</Dropdown>
			</Variant>

			<Variant name="Placements">
				<div className="c-hbox g-3">
					<Dropdown
						triggerClassName="c-button"
						placement="bottom-start"
						trigger={<>bottom-start</>}
					>
						<ul className="c-nav vertical emph">
							<li>
								<Button kind="nav-item">Item 1</Button>
							</li>
							<li>
								<Button kind="nav-item">Item 2</Button>
							</li>
						</ul>
					</Dropdown>
					<Dropdown
						triggerClassName="c-button secondary"
						placement="bottom-end"
						trigger={<>bottom-end</>}
					>
						<ul className="c-nav vertical emph">
							<li>
								<Button kind="nav-item">Item 1</Button>
							</li>
							<li>
								<Button kind="nav-item">Item 2</Button>
							</li>
						</ul>
					</Dropdown>
					<Dropdown
						triggerClassName="c-button"
						placement="top-start"
						trigger={<>top-start</>}
					>
						<ul className="c-nav vertical emph">
							<li>
								<Button kind="nav-item">Item 1</Button>
							</li>
						</ul>
					</Dropdown>
					<Dropdown
						triggerClassName="c-button"
						placement="top-end"
						trigger={<>top-end</>}
					>
						<ul className="c-nav vertical emph">
							<li>
								<Button kind="nav-item">Item 1</Button>
							</li>
						</ul>
					</Dropdown>
				</div>
			</Variant>

			<Variant name="Elevation">
				<div className="c-hbox g-3">
					<Dropdown triggerClassName="c-button" elevation="low" trigger={<>Low</>}>
						<ul className="c-nav vertical emph">
							<li>
								<Button kind="nav-item">Low elevation</Button>
							</li>
						</ul>
					</Dropdown>
					<Dropdown triggerClassName="c-button" elevation="mid" trigger={<>Mid</>}>
						<ul className="c-nav vertical emph">
							<li>
								<Button kind="nav-item">Mid elevation</Button>
							</li>
						</ul>
					</Dropdown>
					<Dropdown triggerClassName="c-button" elevation="high" trigger={<>High</>}>
						<ul className="c-nav vertical emph">
							<li>
								<Button kind="nav-item">High elevation</Button>
							</li>
						</ul>
					</Dropdown>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
