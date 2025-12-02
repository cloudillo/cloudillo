import * as React from 'react'
import { Story, Variant } from './storybook.js'
import {
	Input,
	TextArea,
	NativeSelect,
	InputGroup,
	Fieldset,
	Toggle,
	Button,
	HBox,
	VBox
} from '@cloudillo/react'

export function FormStory() {
	const [toggleValue, setToggleValue] = React.useState(false)

	return (
		<Story
			name="Form"
			description="Form components including Input, TextArea, Select, InputGroup, Fieldset, and Toggle."
			props={[
				{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
				{ name: 'resize', type: 'boolean', descr: 'TextArea only: allow resize' },
				{ name: 'legend', type: 'React.ReactNode', descr: 'Fieldset only: legend text' },
				{ name: 'variant', type: 'ColorVariant', descr: 'Toggle only: color variant' },
				{ name: 'label', type: 'React.ReactNode', descr: 'Toggle only: label text' }
			]}
		>
			<Variant name="Input">
				<VBox gap={2}>
					<Input placeholder="Text input" />
					<Input type="email" placeholder="Email input" />
					<Input type="password" placeholder="Password input" />
					<Input type="number" placeholder="Number input" />
					<Input disabled placeholder="Disabled input" />
				</VBox>
			</Variant>

			<Variant name="TextArea">
				<VBox gap={2}>
					<TextArea placeholder="Basic textarea" rows={3} />
					<TextArea resize placeholder="Resizable textarea" rows={3} />
				</VBox>
			</Variant>

			<Variant name="NativeSelect">
				<VBox gap={2}>
					<NativeSelect>
						<option value="">Select an option</option>
						<option value="1">Option 1</option>
						<option value="2">Option 2</option>
						<option value="3">Option 3</option>
					</NativeSelect>
					<NativeSelect disabled>
						<option>Disabled select</option>
					</NativeSelect>
				</VBox>
			</Variant>

			<Variant name="InputGroup">
				<VBox gap={2}>
					<InputGroup>
						<Input placeholder="Username" />
						<Button variant="primary">Submit</Button>
					</InputGroup>
					<InputGroup>
						<span className="c-input-group-text">@</span>
						<Input placeholder="Email" />
					</InputGroup>
				</VBox>
			</Variant>

			<Variant name="Fieldset">
				<Fieldset legend="User Information">
					<VBox gap={2}>
						<Input placeholder="Full name" />
						<Input type="email" placeholder="Email" />
						<TextArea placeholder="Bio" rows={2} />
					</VBox>
				</Fieldset>
			</Variant>

			<Variant name="Toggle">
				<VBox gap={2}>
					<Toggle label="Default toggle" />
					<Toggle variant="primary" label="Primary toggle" />
					<Toggle variant="success" label="Success toggle" />
					<Toggle variant="error" label="Error toggle" />
					<Toggle
						checked={toggleValue}
						onChange={(e) => setToggleValue(e.target.checked)}
						label={`Toggle is ${toggleValue ? 'ON' : 'OFF'}`}
					/>
				</VBox>
			</Variant>
		</Story>
	)
}

// vim: ts=4
