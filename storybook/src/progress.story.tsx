import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Progress } from '@cloudillo/react'

export function ProgressStory() {
	const [value, setValue] = React.useState(50)

	return <Story
		name="Progress"
		description="Progress bar component with color variants and indeterminate state support."
		props={[
			{ name: 'value', type: 'number', descr: 'Progress value (0-100)' },
			{ name: 'variant', type: '"primary" | "secondary" | "accent" | "error" | "warning" | "success"', descr: 'Color variant' },
			{ name: 'indeterminate', type: 'boolean', descr: 'Show indeterminate animation' }
		]}
	>
		<Variant name="Basic Progress">
			<div className="c-vbox g-2">
				<Progress value={25}/>
				<Progress value={50}/>
				<Progress value={75}/>
				<Progress value={100}/>
			</div>
		</Variant>

		<Variant name="Color Variants">
			<div className="c-vbox g-2">
				<Progress value={60}/>
				<Progress value={60} variant="primary"/>
				<Progress value={60} variant="secondary"/>
				<Progress value={60} variant="accent"/>
				<Progress value={60} variant="success"/>
				<Progress value={60} variant="warning"/>
				<Progress value={60} variant="error"/>
			</div>
		</Variant>

		<Variant name="Interactive">
			<div className="c-vbox g-2">
				<Progress value={value} variant="primary"/>
				<input
					type="range"
					min={0}
					max={100}
					value={value}
					onChange={(e) => setValue(Number(e.target.value))}
					className="w-100"
				/>
				<div>Value: {value}%</div>
			</div>
		</Variant>
	</Story>
}

// vim: ts=4
