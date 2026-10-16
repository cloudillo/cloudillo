// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	ActionSheet,
	ActionSheetDivider,
	ActionSheetItem,
	ActionSheetSubItem,
	Button,
	IcDelete,
	IcDownload,
	IcDuplicate,
	IcEdit,
	IcFolder,
	IcPin,
	IcShare,
	IcWarning
} from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

export function ActionSheetStory() {
	const [basicOpen, setBasicOpen] = React.useState(false)
	const [fullOpen, setFullOpen] = React.useState(false)

	return (
		<Story
			name="ActionSheet"
			description="Deprecated: use Menu — it renders as this bottom sheet by itself on touch devices and below 48rem. Kept for existing app callers; shown here as the sheet renderer Menu uses."
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
					<Button color="primary" onClick={() => setBasicOpen(true)}>
						Open action sheet
					</Button>
					<ActionSheet
						isOpen={basicOpen}
						onClose={() => setBasicOpen(false)}
						title="document.pdf"
					>
						<ActionSheetItem icon={<IcShare />} label="Share" />
						<ActionSheetItem icon={<IcDuplicate />} label="Duplicate" />
						<ActionSheetItem icon={<IcDownload />} label="Download" />
						<ActionSheetDivider />
						<ActionSheetItem icon={<IcDelete />} label="Delete" danger />
					</ActionSheet>
				</div>
			</Variant>

			<Variant
				name="With submenu (nested actions)"
				description="ActionSheetSubItem expands inline on tap — no nested overlays, stays thumb-reachable."
			>
				<div>
					<Button color="primary" onClick={() => setFullOpen(true)}>
						Open full sheet
					</Button>
					<ActionSheet
						isOpen={fullOpen}
						onClose={() => setFullOpen(false)}
						title="Photo actions"
					>
						<ActionSheetItem icon={<IcEdit />} label="Edit" />
						<ActionSheetItem icon={<IcPin />} label="Pin" />
						<ActionSheetSubItem icon={<IcShare />} label="Share" detail="5 apps">
							<ActionSheetItem label="Copy link" />
							<ActionSheetItem label="Message" />
							<ActionSheetItem label="Email" />
						</ActionSheetSubItem>
						<ActionSheetItem icon={<IcFolder />} label="Move to folder" />
						<ActionSheetDivider />
						<ActionSheetItem icon={<IcWarning />} label="Report" danger />
					</ActionSheet>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
