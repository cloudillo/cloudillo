// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { InlineEditForm } from '@cloudillo/react'

export function InlineEditFormStory() {
	const [value1, setValue1] = React.useState('Document Title')
	const [value2, setValue2] = React.useState('Folder Name')
	const [editing1, setEditing1] = React.useState(false)
	const [editing2, setEditing2] = React.useState(true)

	return (
		<Story
			name="InlineEditForm"
			description="Inline editing form for quick text editing with save/cancel actions."
			props={[
				{ name: 'value', type: 'string', descr: 'Current value to edit', required: true },
				{
					name: 'onSave',
					type: '(value: string) => void',
					descr: 'Called when save button clicked',
					required: true
				},
				{
					name: 'onCancel',
					type: '() => void',
					descr: 'Called when cancel button clicked',
					required: true
				},
				{ name: 'placeholder', type: 'string', descr: 'Input placeholder text' },
				{
					name: 'autoFocus',
					type: 'boolean',
					descr: 'Auto-focus input on mount (default: true)'
				},
				{
					name: 'selectOnFocus',
					type: 'boolean',
					descr: 'Select all text on focus (default: true)'
				},
				{ name: 'size', type: '"small" | "default"', descr: 'Size variant' }
			]}
		>
			<Variant name="Interactive Example">
				<div className="c-vbox g-3" style={{ maxWidth: 400 }}>
					{editing1 ? (
						<InlineEditForm
							value={value1}
							onSave={(v) => {
								setValue1(v)
								setEditing1(false)
							}}
							onCancel={() => setEditing1(false)}
							placeholder="Enter title"
						/>
					) : (
						<div className="c-hbox g-2 align-items-center">
							<span>{value1}</span>
							<button
								className="c-button small secondary"
								onClick={() => setEditing1(true)}
							>
								Edit
							</button>
						</div>
					)}
				</div>
			</Variant>

			<Variant name="Default Size">
				<div style={{ maxWidth: 400 }}>
					<InlineEditForm
						value="Default size input"
						onSave={() => {}}
						onCancel={() => {}}
					/>
				</div>
			</Variant>

			<Variant name="Small Size">
				<div style={{ maxWidth: 300 }}>
					<InlineEditForm
						value="Small size input"
						onSave={() => {}}
						onCancel={() => {}}
						size="small"
					/>
				</div>
			</Variant>

			<Variant name="With Placeholder">
				<div style={{ maxWidth: 400 }}>
					<InlineEditForm
						value=""
						onSave={() => {}}
						onCancel={() => {}}
						placeholder="Enter a name..."
					/>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
