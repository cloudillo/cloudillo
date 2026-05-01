// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Story, Variant } from './storybook.js'
import { Menu, MenuItem, MenuDivider, MenuHeader, SubMenuItem, Button } from '@cloudillo/react'
import {
	LuCopy,
	LuClipboard,
	LuScissors,
	LuTrash2,
	LuPencil,
	LuShare2,
	LuDownload
} from 'react-icons/lu'

export function MenuStory() {
	const [basicPos, setBasicPos] = React.useState<{ x: number; y: number } | null>(null)
	const [fullPos, setFullPos] = React.useState<{ x: number; y: number } | null>(null)

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
			description="Positioned context menu rendered via portal. Renders at an absolute (x, y) position, adjusts to stay within the viewport, supports keyboard navigation (Arrow keys / Home / End / Escape), and submenu expansion via SubMenuItem."
			props={[
				{
					name: 'position',
					type: '{ x: number; y: number }',
					required: true,
					descr: 'Absolute viewport coordinates for the top-left corner'
				},
				{
					name: 'onClose',
					type: '() => void',
					required: true,
					descr: 'Called on Escape, outside click, or item activation'
				}
			]}
		>
			<Variant
				name="Basic context menu"
				description="Right-click or click the button to open at pointer position."
			>
				<div style={{ padding: 16 }}>
					<Button
						variant="secondary"
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
							<MenuItem icon={<LuTrash2 />} label="Delete" danger />
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
						variant="secondary"
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
							<MenuItem icon={<LuTrash2 />} label="Move to trash" danger />
						</Menu>
					)}
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
