import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Select } from '@cloudillo/react'

// Mock data for examples
const mockUsers = [
	{ id: '1', name: 'Alice Anderson', email: 'alice@example.com' },
	{ id: '2', name: 'Bob Builder', email: 'bob@example.com' },
	{ id: '3', name: 'Charlie Developer', email: 'charlie@example.com' },
	{ id: '4', name: 'Dana Engineer', email: 'dana@example.com' },
	{ id: '5', name: 'Eve Administrator', email: 'eve@example.com' }
]

type User = (typeof mockUsers)[0]

export function SelectStory() {
	const [selectedUser, setSelectedUser] = React.useState<User | undefined>()

	async function getData(q: string): Promise<User[]> {
		// Simulate async search
		await new Promise((resolve) => setTimeout(resolve, 100))
		return mockUsers.filter(
			(u) =>
				u.name.toLowerCase().includes(q.toLowerCase()) ||
				u.email.toLowerCase().includes(q.toLowerCase())
		)
	}

	return (
		<Story
			name="Select"
			description="Autocomplete select component using Downshift. Supports async data fetching, filtering, and custom rendering."
			props={[
				{
					name: 'className',
					type: 'string',
					descr: 'Additional CSS classes for container'
				},
				{ name: 'inputClassName', type: 'string', descr: 'CSS classes for input element' },
				{ name: 'placeholder', type: 'string', descr: 'Input placeholder text' },
				{
					name: 'getData',
					type: '(q: string) => Promise<T[]>',
					descr: 'Async function to fetch data',
					required: true
				},
				{
					name: 'onChange',
					type: '(item: T) => void',
					descr: 'Called when item is selected'
				},
				{
					name: 'onSelectItem',
					type: '(item: T | undefined) => void',
					descr: 'Called when selection changes'
				},
				{
					name: 'itemToId',
					type: '(item: T) => string',
					descr: 'Extract unique ID from item',
					required: true
				},
				{
					name: 'itemToString',
					type: '(item: T | null) => string',
					descr: 'Convert item to string',
					required: true
				},
				{
					name: 'renderItem',
					type: '(props: T) => React.ReactNode',
					descr: 'Render function for dropdown items',
					required: true
				}
			]}
		>
			<Variant name="Basic Select">
				<div>
					<Select<User>
						placeholder="Search users..."
						getData={getData}
						onChange={(item) => console.log('Selected:', item)}
						onSelectItem={(item) => setSelectedUser(item)}
						itemToId={(item) => item.id}
						itemToString={(item) => item?.name || ''}
						renderItem={(item) => (
							<div>
								<div>
									<strong>{item.name}</strong>
								</div>
								<div style={{ fontSize: '0.85em', color: '#666' }}>
									{item.email}
								</div>
							</div>
						)}
					/>
					{selectedUser && (
						<div
							style={{ marginTop: '1rem', padding: '0.5rem', background: '#f0f0f0' }}
						>
							Selected: {selectedUser.name} ({selectedUser.email})
						</div>
					)}
				</div>
			</Variant>

			<Variant name="Select with Custom Input Styling">
				<Select<User>
					inputClassName="custom-input"
					placeholder="Type to search..."
					getData={getData}
					itemToId={(item) => item.id}
					itemToString={(item) => item?.name || ''}
					renderItem={(item) => <strong>{item.name}</strong>}
				/>
			</Variant>
		</Story>
	)
}

// vim: ts=4
