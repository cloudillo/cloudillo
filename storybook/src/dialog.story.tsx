import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Dialog, useDialog, DialogContainer } from '@cloudillo/react'
import { Button } from '@cloudillo/react'

export function DialogStory() {
	const [isOpen, setIsOpen] = React.useState(false)

	return <Story
		name="Dialog"
		description="HTML5 dialog component with modal behavior. Provides a clean interface for showing modal dialogs."
		props={[
			{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
			{ name: 'open', type: 'boolean', descr: 'Whether dialog is open' },
			{ name: 'title', type: 'string', descr: 'Dialog title' },
			{ name: 'onClose', type: '() => void', descr: 'Close handler' },
			{ name: 'children', type: 'React.ReactNode', descr: 'Dialog content', required: true }
		]}
	>
		<Variant name='Basic Dialog'>
			<div>
				<Button primary onClick={() => setIsOpen(true)}>
					Open Dialog
				</Button>
				<Dialog
					open={isOpen}
					title="Example Dialog"
					onClose={() => setIsOpen(false)}
				>
					<p>This is the dialog content.</p>
					<p>You can put any React components here.</p>
					<div className="c-group g-2 mt-3">
						<Button primary onClick={() => setIsOpen(false)}>OK</Button>
						<Button onClick={() => setIsOpen(false)}>Cancel</Button>
					</div>
				</Dialog>
			</div>
		</Variant>
	</Story>
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

	return <>
		<Story
			name="useDialog"
			description="Hook for programmatically showing dialogs. Provides tell(), confirm(), ask(), and askText() methods. Requires DialogContainer in app root."
			props={[
				{ name: 'isOpen', type: 'boolean', descr: 'Whether any dialog is currently open' },
				{ name: 'tell', type: '(title: string, descr: string, className?: string) => Promise<void>', descr: 'Show info dialog' },
				{ name: 'confirm', type: '(title: string, descr: string, className?: string) => Promise<boolean>', descr: 'Show OK/Cancel dialog' },
				{ name: 'ask', type: '(title: string, descr: string, className?: string) => Promise<boolean>', descr: 'Show Yes/No dialog' },
				{ name: 'askText', type: '(title: string, descr: string, opts?: {...}) => Promise<string | undefined>', descr: 'Show text input dialog' }
			]}
		>
			<Variant name='Tell Dialog (Info)'>
				<Button primary onClick={handleTell}>
					Show Info
				</Button>
			</Variant>

			<Variant name='Confirm Dialog (OK/Cancel)'>
				<Button primary onClick={handleConfirm}>
					Show Confirm
				</Button>
			</Variant>

			<Variant name='Ask Dialog (Yes/No)'>
				<Button primary onClick={handleAsk}>
					Show Yes/No
				</Button>
			</Variant>

			<Variant name='Ask Text Dialog'>
				<Button primary onClick={handleAskText}>
					Ask for Text
				</Button>
			</Variant>

			<Variant name='Ask Text Dialog (Multiline)'>
				<Button primary onClick={handleAskTextMultiline}>
					Ask for Multiline Text
				</Button>
			</Variant>
		</Story>
		<DialogContainer />
	</>
}

// vim: ts=4
