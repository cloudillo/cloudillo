// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { BottomSheetSnapPoint } from '@cloudillo/react'
import { BottomSheet, Button, EmptyState, ImmersiveOverlay } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

export function BottomSheetStory() {
	const [snap, setSnap] = React.useState<BottomSheetSnapPoint>('closed')
	const [backdropSnap, setBackdropSnap] = React.useState<BottomSheetSnapPoint>('closed')

	return (
		<Story
			name="BottomSheet"
			description="Draggable bottom panel with snap points — closed, peek (64px), half (50vh), full (90vh). Users drag the handle to change snap points. Unlike ActionSheet, content remains in-page and can coexist with the main view (e.g. a map + filter sheet). Lifts above the on-screen keyboard (visualViewport → --kb-inset). Respects prefers-reduced-motion."
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
					descr: 'Modal sheet on native <dialog>.showModal(): dimmed, inert page (default false)'
				},
				{
					name: 'onBackdropClick',
					type: '() => void',
					descr: 'Escape or backdrop click on a modal sheet (default: snap to closed)'
				}
			]}
		>
			<Variant
				name="Three snap points"
				description="Drag the handle to peek/half/full, or use the buttons below."
			>
				<div>
					<div className="c-hbox g-2" style={{ marginBottom: 16 }}>
						<Button color="secondary" onClick={() => setSnap('peek')}>
							Peek
						</Button>
						<Button color="secondary" onClick={() => setSnap('half')}>
							Half
						</Button>
						<Button color="secondary" onClick={() => setSnap('full')}>
							Full
						</Button>
						<Button color="secondary" onClick={() => setSnap('closed')}>
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
				name="Modal (showBackdrop)"
				description="showBackdrop opens the sheet as a modal <dialog> — the page is inert; Escape or a backdrop tap dismisses."
			>
				<div>
					<Button color="primary" onClick={() => setBackdropSnap('half')}>
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
							<p>Tap the backdrop or press Escape to dismiss.</p>
						</div>
					</BottomSheet>
				</div>
			</Variant>
		</Story>
	)
}

export function ImmersiveOverlayStory() {
	const [open, setOpen] = React.useState(false)

	return (
		<Story
			name="ImmersiveOverlay"
			description="Full-screen, always-dark stage for media (camera capture, image viewer) on the native-dialog base. No title bar — name it with aria-label. Escape closes; the backdrop does not. Content inside gets the inverse tokens."
			props={[
				{ name: 'open', type: 'boolean', descr: 'Whether the overlay is shown' },
				{ name: 'onClose', type: '() => void', descr: 'Escape calls it; unset = blocking' },
				{
					name: 'controls',
					type: 'ReactNode',
					descr: 'Control bar pinned to the bottom (camera / viewer buttons)'
				},
				{ name: 'children', type: 'ReactNode', descr: 'The media stage, centred' }
			]}
		>
			<Variant name="Camera-style" description="Stage content plus a controls slot.">
				<div>
					<Button color="primary" onClick={() => setOpen(true)}>
						Open overlay
					</Button>
					<ImmersiveOverlay
						open={open}
						onClose={() => setOpen(false)}
						aria-label="Camera"
						controls={
							<>
								<Button onClick={() => setOpen(false)}>Cancel</Button>
								<Button color="primary">Capture</Button>
							</>
						}
					>
						<EmptyState
							inverse
							title="No camera"
							description="Press Escape to close."
						/>
					</ImmersiveOverlay>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
