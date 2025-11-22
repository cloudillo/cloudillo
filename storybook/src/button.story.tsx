import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Button, Popper } from '@cloudillo/react'
import {
	LuHeart as IcHeart,
	LuShare2 as IcShare,
	LuSettings as IcMore
} from 'react-icons/lu'

export function ButtonStory() {
	return <Story
		name="Button"
		description="Button component with different variants and states. Supports icons, different visual styles, and click animations."
		props={[
			{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
			{ name: 'onClick', type: '(evt: React.MouseEvent) => void', descr: 'Click handler' },
			{ name: 'type', type: '"button" | "submit"', descr: 'Button type' },
			{ name: 'disabled', type: 'boolean', descr: 'Disable button' },
			{ name: 'icon', type: 'React.ReactNode', descr: 'Icon to display before text' },
			{ name: 'primary', type: 'boolean', descr: 'Primary button style' },
			{ name: 'secondary', type: 'boolean', descr: 'Secondary button style' },
			{ name: 'accent', type: 'boolean', descr: 'Accent button style' },
			{ name: 'link', type: 'boolean', descr: 'Link-style button (minimal styling)' },
			{ name: 'children', type: 'React.ReactNode', descr: 'Button content' }
		]}
	>
		<Variant name='Primary Button'>
			<Button primary onClick={() => alert('Clicked!')}>
				Primary Button
			</Button>
		</Variant>

		<Variant name='Primary Button with Icon'>
			<Button primary icon={<IcHeart/>} onClick={() => alert('Liked!')}>
				Like
			</Button>
		</Variant>

		<Variant name='Secondary Button'>
			<Button secondary>
				Secondary Button
			</Button>
		</Variant>

		<Variant name='Secondary Button with Icon'>
			<Button secondary icon={<IcShare/>}>
				Share
			</Button>
		</Variant>

		<Variant name='Accent Button'>
			<Button accent>
				Accent Button
			</Button>
		</Variant>

		<Variant name='Link Button'>
			<Button link>
				Link Style
			</Button>
		</Variant>

		<Variant name='Link Button with Icon'>
			<Button link icon={<IcMore/>}>
				More Options
			</Button>
		</Variant>

		<Variant name='Disabled Button'>
			<Button primary disabled>
				Disabled
			</Button>
		</Variant>
	</Story>
}

export function PopperStory() {
	return <Story
		name="Popper"
		description="Dropdown menu component using Popper.js for positioning. Automatically manages open/close state and positioning."
		props={[
			{ name: 'className', type: 'string', descr: 'Additional CSS classes for container' },
			{ name: 'menuClassName', type: 'string', descr: 'CSS classes for menu trigger' },
			{ name: 'icon', type: 'React.ReactNode', descr: 'Icon for menu trigger' },
			{ name: 'label', type: 'React.ReactNode', descr: 'Label for menu trigger' },
			{ name: 'children', type: 'React.ReactNode', descr: 'Menu content' }
		]}
	>
		<Variant name='Popper Menu'>
			<Popper icon={<IcMore/>} label="Options">
				<div className="c-nav flex-column">
					<button className="c-nav-item">Edit</button>
					<button className="c-nav-item">Delete</button>
					<button className="c-nav-item">Share</button>
				</div>
			</Popper>
		</Variant>

		<Variant name='Popper with Icon Only'>
			<Popper icon={<IcMore/>}>
				<div className="c-nav flex-column">
					<button className="c-nav-item">Option 1</button>
					<button className="c-nav-item">Option 2</button>
					<button className="c-nav-item">Option 3</button>
				</div>
			</Popper>
		</Variant>
	</Story>
}

export function ContainerStory() {
	return <Story
		name="Container"
		description="Main content container component with responsive styling and overflow handling."
		props={[
			{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
			{ name: 'children', type: 'React.ReactNode', descr: 'Container content', required: true }
		]}
	>
		<Variant name='Basic Container'>
			<div style={{ height: '200px', border: '1px solid #ccc' }}>
				<div className="c-container">
					<h3>Container Content</h3>
					<p>This is a basic container with standard styling.</p>
					<p>It provides consistent spacing and overflow handling.</p>
				</div>
			</div>
		</Variant>
	</Story>
}

// vim: ts=4
