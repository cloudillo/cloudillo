import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Modal, Panel, Button, VBox, HBox, Input } from '@cloudillo/react'

export function ModalStory() {
	const [isOpen, setIsOpen] = React.useState(false)
	const [isFormOpen, setIsFormOpen] = React.useState(false)

	return <Story
		name="Modal"
		description="Modal/dialog backdrop component for displaying overlays and dialogs."
		props={[
			{ name: 'open', type: 'boolean', descr: 'Whether the modal is open' },
			{ name: 'onClose', type: '() => void', descr: 'Callback when modal should close' },
			{ name: 'closeOnBackdrop', type: 'boolean', descr: 'Close when clicking backdrop (default: true)' }
		]}
	>
		<Variant name="Basic Modal">
			<div>
				<Button variant="primary" onClick={() => setIsOpen(true)}>
					Open Modal
				</Button>
				<Modal open={isOpen} onClose={() => setIsOpen(false)}>
					<Panel emph className="c-dialog p-4">
						<h3 className="mt-0">Modal Title</h3>
						<p>This is a basic modal dialog with some content.</p>
						<HBox gap={2} className="justify-content-end">
							<Button onClick={() => setIsOpen(false)}>Cancel</Button>
							<Button variant="primary" onClick={() => setIsOpen(false)}>Confirm</Button>
						</HBox>
					</Panel>
				</Modal>
			</div>
		</Variant>

		<Variant name="Form Modal">
			<div>
				<Button variant="secondary" onClick={() => setIsFormOpen(true)}>
					Open Form
				</Button>
				<Modal open={isFormOpen} onClose={() => setIsFormOpen(false)}>
					<Panel emph className="c-dialog p-4">
						<h3 className="mt-0">Create New Item</h3>
						<VBox gap={2}>
							<Input placeholder="Item name"/>
							<Input placeholder="Description"/>
						</VBox>
						<HBox gap={2} className="justify-content-end mt-3">
							<Button onClick={() => setIsFormOpen(false)}>Cancel</Button>
							<Button variant="primary" onClick={() => setIsFormOpen(false)}>Create</Button>
						</HBox>
					</Panel>
				</Modal>
			</div>
		</Variant>

		<Variant name="Non-dismissible Modal">
			<div>
				<p className="text-disabled">
					Modal with closeOnBackdrop=false requires clicking the close button.
				</p>
			</div>
		</Variant>
	</Story>
}

// vim: ts=4
