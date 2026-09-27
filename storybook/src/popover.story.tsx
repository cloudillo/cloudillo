// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Popover } from '@cloudillo/react'
import * as React from 'react'
import { LuChevronDown as IcChevron, LuFilter as IcFilter } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function PopoverStory() {
	const [open, setOpen] = React.useState(false)

	return (
		<Story
			name="Popover"
			description="Anchored content in the top layer (native `popover`). Escape and an outside click close it; focus moves onto the surface and returns to the trigger. Replaces Popper and Dropdown."
			props={[
				{
					name: 'trigger',
					type: 'React.ReactElement',
					descr: 'A Button; gets aria-expanded/controls'
				},
				{
					name: 'placement',
					type: 'AnchorPlacement',
					descr: 'Popper placement (default "bottom-start"); flips when out of room'
				},
				{ name: 'width', type: '"sm" | "md" | "lg"', descr: 'Fixed surface width' },
				{ name: 'open', type: 'boolean', descr: 'Controlled open state' },
				{
					name: 'onOpenChange',
					type: '(open: boolean) => void',
					descr: 'Open state changes'
				},
				{
					name: 'role',
					type: '"dialog" | "menu" | "listbox"',
					descr: 'Default "dialog"; "menu" roves focus over items'
				},
				{ name: 'elevation', type: '"low" | "mid" | "high"', descr: 'Default "high"' }
			]}
		>
			<Variant name="Basic">
				<Popover
					width="md"
					aria-label="Filters"
					trigger={
						<Button>
							<IcFilter /> Filters <IcChevron />
						</Button>
					}
				>
					<div className="p-3">
						<p>Any content: forms, lists, previews.</p>
						<Button variant="filled" color="primary">
							Apply
						</Button>
					</div>
				</Popover>
			</Variant>

			<Variant name="Controlled, top-end">
				<Popover
					open={open}
					onOpenChange={setOpen}
					placement="top-end"
					width="sm"
					aria-label="Info"
					trigger={<Button>{open ? 'Close' : 'Open'}</Button>}
				>
					<div className="p-3">
						<Button onClick={() => setOpen(false)}>Done</Button>
					</div>
				</Popover>
			</Variant>
		</Story>
	)
}

// vim: ts=4
