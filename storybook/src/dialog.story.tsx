import { ActionBar, Button, Dialog, DialogContainer, Input, useDialog } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

export function DialogStory() {
	const [isOpen, setIsOpen] = React.useState(false)
	const [formOpen, setFormOpen] = React.useState(false)
	const [blockingOpen, setBlockingOpen] = React.useState(false)

	return (
		<Story
			name="Dialog"
			description="Modal dialog on the native <dialog> (showModal): focus trap, Escape, top layer, inert background. Header and footer stay pinned while the body scrolls."
			props={[
				{ name: 'open', type: 'boolean', descr: 'Whether dialog is open' },
				{ name: 'title', type: 'ReactNode', descr: 'Heading (h2) and accessible name' },
				{
					name: 'description',
					type: 'ReactNode',
					descr: 'Text under the title (aria-describedby)'
				},
				{ name: 'icon', type: 'ReactNode', descr: 'Leading icon of the title row' },
				{ name: 'size', type: "'sm' | 'md' | 'lg' | 'full'", descr: 'Width' },
				{
					name: 'footer',
					type: 'ReactNode',
					descr: 'Pinned footer, usually an <ActionBar>'
				},
				{
					name: 'dismissable',
					type: 'boolean',
					descr: 'Escape, backdrop and close button close it (default true); false = blocking'
				},
				{ name: 'onSubmit', type: '(evt) => void', descr: 'Form mode: Enter submits' },
				{ name: 'onClose', type: '() => void', descr: 'Close handler' },
				{ name: 'className', type: 'string', descr: 'Additional CSS classes on the panel' }
			]}
		>
			<Variant name="Basic Dialog">
				<div>
					<Button color="primary" onClick={() => setIsOpen(true)}>
						Open Dialog
					</Button>
					<Dialog
						open={isOpen}
						size="sm"
						title="Example Dialog"
						description="You can put any React components in the body."
						onClose={() => setIsOpen(false)}
						footer={
							<ActionBar>
								<Button onClick={() => setIsOpen(false)}>Cancel</Button>
								<Button color="primary" onClick={() => setIsOpen(false)}>
									Save
								</Button>
							</ActionBar>
						}
					>
						<p>This is the dialog content.</p>
					</Dialog>
				</div>
			</Variant>

			<Variant name="Form mode">
				<div>
					<Button onClick={() => setFormOpen(true)}>Rename…</Button>
					<Dialog
						open={formOpen}
						size="sm"
						title="Rename file"
						onClose={() => setFormOpen(false)}
						onSubmit={() => setFormOpen(false)}
						footer={
							<ActionBar>
								<Button onClick={() => setFormOpen(false)}>Cancel</Button>
								<Button type="submit" color="primary">
									Rename
								</Button>
							</ActionBar>
						}
					>
						<Input autoFocus defaultValue="report.pdf" aria-label="File name" />
					</Dialog>
				</div>
			</Variant>

			<Variant name="Blocking (dismissable=false) with ActionBar start slot">
				<div>
					<Button onClick={() => setBlockingOpen(true)}>Open blocking</Button>
					<Dialog
						open={blockingOpen}
						size="md"
						dismissable={false}
						title="Unsaved changes"
						onClose={() => setBlockingOpen(false)}
						footer={
							<ActionBar
								start={
									<Button
										color="error"
										variant="ghost"
										onClick={() => setBlockingOpen(false)}
									>
										Discard
									</Button>
								}
							>
								<Button onClick={() => setBlockingOpen(false)}>Keep editing</Button>
								<Button color="primary" onClick={() => setBlockingOpen(false)}>
									Save
								</Button>
							</ActionBar>
						}
					>
						<p>No Escape, no backdrop close: pick an action.</p>
					</Dialog>
				</div>
			</Variant>
		</Story>
	)
}

export function UseDialogStory() {
	const dialog = useDialog()

	async function handleTell() {
		await dialog.tell('Information', 'This is an informational message.')
	}

	async function handleConfirm() {
		const result = await dialog.confirm('Confirm Action', 'Are you sure you want to proceed?')
		alert(result ? 'Confirmed' : 'Cancelled')
	}

	async function handleDelete() {
		const result = await dialog.confirm(
			'Delete file?',
			'report.pdf will be moved to the trash.',
			{
				color: 'error',
				confirmLabel: 'Delete'
			}
		)
		alert(result ? 'Deleted' : 'Cancelled')
	}

	async function handleIrreversible() {
		const result = await dialog.confirm(
			'Delete identity?',
			'This **cannot be undone**. All data of this identity is lost.',
			{ color: 'error', confirmLabel: 'Delete identity', requireText: 'DELETE' }
		)
		alert(result ? 'Deleted' : 'Cancelled')
	}

	async function handleAsk() {
		const result = await dialog.ask('Question', 'Do you agree with this?')
		alert(result ? 'Yes' : 'No')
	}

	async function handleAskText() {
		const result = await dialog.askText('Enter Name', 'Please enter your name:', {
			placeholder: 'Your name here'
		})
		if (result) alert(`You entered: ${result}`)
	}

	async function handleAskTextMultiline() {
		const result = await dialog.askText('Enter Description', 'Please enter a description:', {
			placeholder: 'Description here',
			multiline: true,
			defaultValue: 'Default text...'
		})
		if (result) alert(`You entered: ${result}`)
	}

	return (
		<>
			<Story
				name="useDialog"
				description="Hook for programmatically showing dialogs. Provides tell(), confirm(), ask(), and askText() methods. Requires DialogContainer in app root."
				props={[
					{
						name: 'isOpen',
						type: 'boolean',
						descr: 'Whether any dialog is currently open'
					},
					{
						name: 'tell',
						type: '(title, descr, opts?: DialogOptions) => Promise<void>',
						descr: 'Show info dialog'
					},
					{
						name: 'confirm',
						type: '(title, descr, opts?: DialogOptions) => Promise<boolean>',
						descr: 'Show confirm/cancel dialog. opts: { color, confirmLabel, cancelLabel, requireText } (a string is the deprecated className)'
					},
					{
						name: 'ask',
						type: '(title, descr, opts?: DialogOptions) => Promise<boolean>',
						descr: 'Show Yes/No dialog'
					},
					{
						name: 'askText',
						type: '(title, descr, opts?: DialogOptions & { placeholder, defaultValue, multiline }) => Promise<string | undefined>',
						descr: 'Show text input dialog'
					}
				]}
			>
				<Variant name="Tell Dialog (Info)">
					<Button color="primary" onClick={handleTell}>
						Show Info
					</Button>
				</Variant>

				<Variant name="Confirm Dialog (OK/Cancel)">
					<Button color="primary" onClick={handleConfirm}>
						Show Confirm
					</Button>
				</Variant>

				<Variant name="Destructive confirm">
					<Button color="error" onClick={handleDelete}>
						Delete file
					</Button>
				</Variant>

				<Variant name="Irreversible: typed phrase (requireText)">
					<Button color="error" onClick={handleIrreversible}>
						Delete identity
					</Button>
				</Variant>

				<Variant name="Ask Dialog (Yes/No)">
					<Button color="primary" onClick={handleAsk}>
						Show Yes/No
					</Button>
				</Variant>

				<Variant name="Ask Text Dialog">
					<Button color="primary" onClick={handleAskText}>
						Ask for Text
					</Button>
				</Variant>

				<Variant name="Ask Text Dialog (Multiline)">
					<Button color="primary" onClick={handleAskTextMultiline}>
						Ask for Multiline Text
					</Button>
				</Variant>
			</Story>
			<DialogContainer />
		</>
	)
}

// vim: ts=4
