import { Progress } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

export function ProgressStory() {
	const [value, setValue] = React.useState(50)

	return (
		<Story
			name="Progress"
			description="Progress bar component with color variants and indeterminate state support."
			props={[
				{ name: 'value', type: 'number', descr: 'Progress value (0-100)' },
				{
					name: 'color',
					type: 'ColorVariant',
					descr: 'Tone'
				},
				{ name: 'indeterminate', type: 'boolean', descr: 'Show indeterminate animation' }
			]}
		>
			<Variant name="Basic Progress">
				<div className="c-vbox g-2">
					<Progress value={25} />
					<Progress value={50} />
					<Progress value={75} />
					<Progress value={100} />
				</div>
			</Variant>

			<Variant name="Color Variants">
				<div className="c-vbox g-2">
					<Progress value={60} />
					<Progress value={60} color="primary" />
					<Progress value={60} color="secondary" />
					<Progress value={60} color="accent" />
					<Progress value={60} color="success" />
					<Progress value={60} color="warning" />
					<Progress value={60} color="error" />
				</div>
			</Variant>

			<Variant name="Interactive">
				<div className="c-vbox g-2">
					<Progress value={value} color="primary" />
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
	)
}

// vim: ts=4
