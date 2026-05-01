// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Story, Variant } from './storybook.js'
import { BottomSheet, Button } from '@cloudillo/react'
import type { BottomSheetSnapPoint } from '@cloudillo/react'

export function BottomSheetStory() {
	const [snap, setSnap] = React.useState<BottomSheetSnapPoint>('closed')
	const [backdropSnap, setBackdropSnap] = React.useState<BottomSheetSnapPoint>('closed')

	return (
		<Story
			name="BottomSheet"
			description="Draggable bottom panel with snap points — closed, peek (64px), half (50vh), full (90vh). Users drag the handle to change snap points. Unlike ActionSheet, content remains in-page and can coexist with the main view (e.g. a map + filter sheet). Respects prefers-reduced-motion."
			props={[
				{
					name: 'snapPoint',
					type: '"closed" | "peek" | "half" | "full"',
					required: true,
					descr: 'Current snap point (controlled)'
				},
				{
					name: 'onSnapChange',
					type: '(snap) => void',
					required: true,
					descr: 'Fires when drag changes the snap point'
				},
				{
					name: 'snapConfig',
					type: '{ peek?: number; half?: number; full?: number }',
					descr: 'Override default heights'
				},
				{
					name: 'header',
					type: 'ReactNode',
					descr: 'Content shown above the drag handle'
				},
				{
					name: 'showBackdrop',
					type: 'boolean',
					descr: 'Show a dim backdrop behind the sheet (default false)'
				}
			]}
		>
			<Variant
				name="Three snap points"
				description="Drag the handle to peek/half/full, or use the buttons below."
			>
				<div>
					<div className="c-hbox g-2" style={{ marginBottom: 16 }}>
						<Button variant="secondary" onClick={() => setSnap('peek')}>
							Peek
						</Button>
						<Button variant="secondary" onClick={() => setSnap('half')}>
							Half
						</Button>
						<Button variant="secondary" onClick={() => setSnap('full')}>
							Full
						</Button>
						<Button variant="secondary" onClick={() => setSnap('closed')}>
							Closed
						</Button>
					</div>
					<BottomSheet
						snapPoint={snap}
						onSnapChange={setSnap}
						header={<strong>Filters</strong>}
					>
						<div style={{ padding: 16 }}>
							<p>Filter content — works well for mapillo-style search results.</p>
							<p>Scroll me when at half or full snap.</p>
						</div>
					</BottomSheet>
				</div>
			</Variant>

			<Variant
				name="With backdrop (modal-like)"
				description="showBackdrop dims the rest of the page — use when the sheet demands full attention."
			>
				<div>
					<Button variant="primary" onClick={() => setBackdropSnap('half')}>
						Open with backdrop
					</Button>
					<BottomSheet
						snapPoint={backdropSnap}
						onSnapChange={setBackdropSnap}
						showBackdrop
						onBackdropClick={() => setBackdropSnap('closed')}
						header={<strong>Item details</strong>}
					>
						<div style={{ padding: 16 }}>
							<p>Tap the backdrop to dismiss.</p>
						</div>
					</BottomSheet>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
