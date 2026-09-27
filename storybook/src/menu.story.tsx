// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Menu, MenuDivider, MenuHeader, MenuItem, SubMenuItem } from '@cloudillo/react'
import * as React from 'react'
import {
	LuClipboard,
	LuEllipsis,
	LuCopy,
	LuDownload,
	LuPencil,
	LuScissors,
	LuShare2,
	LuTrash2
} from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function MenuStory() {
	const [basicPos, setBasicPos] = React.useState<{ x: number; y: number } | null>(null)
	const [fullPos, setFullPos] = React.useState<{ x: number; y: number } | null>(null)
	const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
	const [view, setView] = React.useState('list')
	const [hidden, setHidden] = React.useState(false)

	function openAt(
		e: React.MouseEvent,
		setter: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
	) {
		e.preventDefault()
		setter({ x: e.clientX, y: e.clientY })
	}

	return (
		<Story
			name="Menu"
			description="One menu for context, anchored and triggered use, in the top layer. Keyboard: Arrow keys / Home / End / Escape and typeahead. On touch or below 48rem it renders as a bottom sheet automatically — never switch to ActionSheet yourself. Activating an item closes the menu unless its onClick calls preventDefault()."
			props={[
				{
					name: 'trigger',
					type: 'ReactElement',
					descr: 'Triggered mode: a Button that toggles the menu'
				},
				{
					name: 'position',
					type: '{ x: number; y: number }',
					descr: 'Context-menu mode: open at viewport coordinates while mounted'
				},
				{
					name: 'anchor',
					type: 'HTMLElement',
					descr: 'Anchored mode: open against this element while mounted'
				},
				{
					name: 'placement',
					type: 'AnchorPlacement',
					descr: "Anchored / triggered modes (default 'bottom-start')"
				},
				{
					name: 'open / onOpenChange',
					type: 'boolean / (open) => void',
					descr: 'Triggered mode, controlled'
				},
				{
					name: 'onClose',
					type: '() => void',
					descr: 'Called on Escape, outside click, or item activation'
				},
				{
					name: 'MenuItem',
					type: 'icon, label, description, shortcut, trailing, color="error", checked, selected, href',
					descr: '`checked` → menuitemcheckbox, `selected` → menuitemradio; `danger` is a deprecated alias of color="error"'
				}
			]}
		>
			<Variant
				name="Basic context menu"
				description="Right-click or click the button to open at pointer position."
			>
				<div style={{ padding: 16 }}>
					<Button
						color="secondary"
						onClick={(e) => openAt(e, setBasicPos)}
						onContextMenu={(e) => openAt(e, setBasicPos)}
					>
						Right-click or click me
					</Button>
					{basicPos && (
						<Menu position={basicPos} onClose={() => setBasicPos(null)}>
							<MenuItem icon={<LuScissors />} label="Cut" shortcut="⌘X" />
							<MenuItem icon={<LuCopy />} label="Copy" shortcut="⌘C" />
							<MenuItem icon={<LuClipboard />} label="Paste" shortcut="⌘V" />
							<MenuDivider />
							<MenuItem icon={<LuTrash2 />} label="Delete" color="error" />
						</Menu>
					)}
				</div>
			</Variant>

			<Variant
				name="With header, submenu, and disabled item"
				description="Full example — MenuHeader, SubMenuItem, disabled state, danger."
			>
				<div style={{ padding: 16 }}>
					<Button
						color="secondary"
						onClick={(e) => openAt(e, setFullPos)}
						onContextMenu={(e) => openAt(e, setFullPos)}
					>
						Open full menu
					</Button>
					{fullPos && (
						<Menu position={fullPos} onClose={() => setFullPos(null)}>
							<MenuHeader>document.pdf</MenuHeader>
							<MenuItem icon={<LuPencil />} label="Rename" shortcut="F2" />
							<MenuItem icon={<LuCopy />} label="Duplicate" />
							<SubMenuItem icon={<LuShare2 />} label="Share">
								<MenuItem label="Copy link" />
								<MenuItem label="Share via email" />
								<MenuItem label="Export to…" />
							</SubMenuItem>
							<MenuItem icon={<LuDownload />} label="Download" disabled />
							<MenuDivider />
							<MenuItem icon={<LuTrash2 />} label="Move to trash" color="error" />
						</Menu>
					)}
				</div>
			</Variant>

			<Variant
				name="Triggered"
				description="`trigger` wires aria-expanded and toggling; checked / selected items, description, trailing, href."
			>
				<div style={{ padding: 16 }}>
					<Menu
						trigger={
							<Button variant="ghost" aria-label="View options">
								<LuEllipsis />
							</Button>
						}
					>
						<MenuHeader>View</MenuHeader>
						<MenuItem
							label="List"
							selected={view === 'list'}
							onClick={() => setView('list')}
						/>
						<MenuItem
							label="Grid"
							description="Large thumbnails"
							selected={view === 'grid'}
							onClick={() => setView('grid')}
						/>
						<MenuDivider />
						<MenuItem
							label="Show hidden files"
							checked={hidden}
							onClick={(e) => {
								e.preventDefault()
								setHidden(!hidden)
							}}
							trailing={hidden ? 'on' : 'off'}
						/>
						<MenuItem label="Help" href="https://cloudillo.org" />
					</Menu>
				</div>
			</Variant>

			<Variant
				name="Anchored"
				description="`anchor` opens against an element the caller already has (here: the clicked button)."
			>
				<div style={{ padding: 16 }}>
					<Button
						color="secondary"
						onClick={(e) => setAnchorEl(anchorEl ? null : e.currentTarget)}
					>
						Anchor here
					</Button>
					{anchorEl && (
						<Menu
							anchor={anchorEl}
							placement="bottom-end"
							onClose={() => setAnchorEl(null)}
						>
							<MenuItem icon={<LuPencil />} label="Rename" />
							<MenuItem icon={<LuTrash2 />} label="Delete" color="error" />
						</Menu>
					)}
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
