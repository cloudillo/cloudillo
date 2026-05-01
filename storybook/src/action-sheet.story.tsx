// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Story, Variant } from './storybook.js'
import {
	ActionSheet,
	ActionSheetItem,
	ActionSheetDivider,
	ActionSheetSubItem,
	Button
} from '@cloudillo/react'
import {
	LuShare2,
	LuCopy,
	LuDownload,
	LuTrash2,
	LuPencil,
	LuStar,
	LuArchive,
	LuFlag
} from 'react-icons/lu'

export function ActionSheetStory() {
	const [basicOpen, setBasicOpen] = React.useState(false)
	const [fullOpen, setFullOpen] = React.useState(false)

	return (
		<Story
			name="ActionSheet"
			description="Bottom-anchored mobile menu that slides up. Preferred over Menu on touch devices — items are larger (≥44px), content spans full width, and it dismisses on backdrop tap / Escape. Use for the same kinds of actions Menu covers, but when the viewport is narrow or interaction is touch-first."
			props={[
				{ name: 'isOpen', type: 'boolean', required: true, descr: 'Open state' },
				{
					name: 'onClose',
					type: '() => void',
					required: true,
					descr: 'Called on backdrop tap or Escape'
				},
				{ name: 'title', type: 'string', descr: 'Optional header label' }
			]}
		>
			<Variant name="Basic actions">
				<div>
					<Button variant="primary" onClick={() => setBasicOpen(true)}>
						Open action sheet
					</Button>
					<ActionSheet
						isOpen={basicOpen}
						onClose={() => setBasicOpen(false)}
						title="document.pdf"
					>
						<ActionSheetItem icon={<LuShare2 />} label="Share" />
						<ActionSheetItem icon={<LuCopy />} label="Duplicate" />
						<ActionSheetItem icon={<LuDownload />} label="Download" />
						<ActionSheetDivider />
						<ActionSheetItem icon={<LuTrash2 />} label="Delete" danger />
					</ActionSheet>
				</div>
			</Variant>

			<Variant
				name="With submenu (nested actions)"
				description="ActionSheetSubItem expands inline on tap — no nested overlays, stays thumb-reachable."
			>
				<div>
					<Button variant="primary" onClick={() => setFullOpen(true)}>
						Open full sheet
					</Button>
					<ActionSheet
						isOpen={fullOpen}
						onClose={() => setFullOpen(false)}
						title="Photo actions"
					>
						<ActionSheetItem icon={<LuPencil />} label="Edit" />
						<ActionSheetItem icon={<LuStar />} label="Add to favorites" />
						<ActionSheetSubItem icon={<LuShare2 />} label="Share" detail="5 apps">
							<ActionSheetItem label="Copy link" />
							<ActionSheetItem label="Message" />
							<ActionSheetItem label="Email" />
						</ActionSheetSubItem>
						<ActionSheetItem icon={<LuArchive />} label="Archive" />
						<ActionSheetDivider />
						<ActionSheetItem icon={<LuFlag />} label="Report" danger />
					</ActionSheet>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
