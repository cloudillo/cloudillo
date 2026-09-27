import { Button, Link, Popper, Tooltip } from '@cloudillo/react'
import * as React from 'react'
import { LuHeart as IcHeart, LuSettings as IcMore, LuShare2 as IcShare } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function ButtonStory() {
	return (
		<Story
			name="Button"
			description="Button component with different variants and states. Supports icons, different visual styles, and click animations."
			props={[
				{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
				{
					name: 'onClick',
					type: '(evt: React.MouseEvent) => void',
					descr: 'Click handler'
				},
				{ name: 'type', type: '"button" | "submit"', descr: 'Button type' },
				{ name: 'disabled', type: 'boolean', descr: 'Disable button' },
				{ name: 'icon', type: 'React.ReactNode', descr: 'Icon to display before text' },
				{ name: 'color', type: 'ColorVariant', descr: 'Tone' },
				{
					name: 'variant',
					type: '"filled" | "soft" | "ghost" | "link"',
					descr: 'Visual style (default filled)'
				},
				{ name: 'size', type: 'Size', descr: 'Size (default md)' },
				{ name: 'shape', type: '"pill"', descr: 'Rounded pill shape' },
				{
					name: 'aria-label',
					type: 'string',
					descr: 'Required when icon-only (icon without children); shown as tooltip'
				},
				{
					name: 'href',
					type: 'string',
					descr: '/… → router Link, absolute → <a> (rel=noopener cross-origin)'
				},
				{ name: 'pressed', type: 'boolean', descr: 'Toggle state (aria-pressed)' },
				{ name: 'active', type: 'boolean', descr: 'Deprecated: use pressed' },
				{ name: 'loading', type: 'boolean', descr: 'Spinner, aria-busy, width kept' },
				{
					name: 'disabledReason',
					type: 'React.ReactNode',
					descr: 'Focusable disabled (aria-disabled); reason shown as tooltip'
				},
				{ name: 'children', type: 'React.ReactNode', descr: 'Button content' }
			]}
		>
			<Variant name="Primary Button">
				<Button color="primary" onClick={() => alert('Clicked!')}>
					Primary Button
				</Button>
			</Variant>

			<Variant name="Primary Button with Icon">
				<Button color="primary" icon={<IcHeart />} onClick={() => alert('Liked!')}>
					Like
				</Button>
			</Variant>

			<Variant name="Secondary Button">
				<Button color="secondary">Secondary Button</Button>
			</Variant>

			<Variant name="Secondary Button with Icon">
				<Button color="secondary" icon={<IcShare />}>
					Share
				</Button>
			</Variant>

			<Variant name="Accent Button">
				<Button color="accent">Accent Button</Button>
			</Variant>

			<Variant name="Link Button">
				<Button variant="link">Link Style</Button>
			</Variant>

			<Variant name="Link Button with Icon">
				<Button variant="link" icon={<IcMore />}>
					More Options
				</Button>
			</Variant>

			<Variant name="Soft and Ghost">
				<div className="c-hbox g-2">
					<Button variant="soft" color="primary">
						Soft
					</Button>
					<Button variant="ghost" color="primary">
						Ghost
					</Button>
				</div>
			</Variant>

			<Variant name="Sizes">
				<div className="c-hbox g-2">
					<Button size="xs">xs</Button>
					<Button size="sm">sm</Button>
					<Button>md</Button>
					<Button size="lg">lg</Button>
					<Button size="xl">xl</Button>
				</div>
			</Variant>

			<Variant name="Icon-only Button">
				<Button variant="ghost" icon={<IcMore />} aria-label="Settings" />
			</Variant>

			<Variant name="Disabled Button">
				<Button color="primary" disabled>
					Disabled
				</Button>
			</Variant>

			<Variant name="Disabled with reason (focusable, tooltip)">
				<Button color="primary" disabledReason="Only the owner can publish">
					Publish
				</Button>
			</Variant>

			<Variant name="Pressed (toggle)">
				<PressedExample />
			</Variant>

			<Variant name="Loading">
				<LoadingExample />
			</Variant>

			<Variant name="Links (href)">
				<div className="c-hbox g-2">
					<Button href="/buttons" variant="soft">
						Router link
					</Button>
					<Button href="https://cloudillo.org" target="_blank">
						External
					</Button>
					<Link href="/buttons">Link component</Link>
				</div>
			</Variant>
		</Story>
	)
}

function PressedExample() {
	const [bold, setBold] = React.useState(false)
	return (
		<Button variant="ghost" pressed={bold} immediate onClick={() => setBold(!bold)}>
			Bold
		</Button>
	)
}

function LoadingExample() {
	const [loading, setLoading] = React.useState(false)
	return (
		<Button
			color="primary"
			loading={loading}
			immediate
			onClick={() => {
				setLoading(true)
				setTimeout(() => setLoading(false), 2000)
			}}
		>
			Save changes
		</Button>
	)
}

export function TooltipStory() {
	return (
		<Story
			name="Tooltip"
			description="Popup label on hover and keyboard focus; Escape closes. Linked via aria-describedby. Icon-only Buttons show their aria-label automatically."
			props={[
				{
					name: 'content',
					type: 'React.ReactNode',
					descr: 'Tooltip text; empty renders nothing'
				},
				{
					name: 'placement',
					type: '"top" | "bottom" | "left" | "right"',
					descr: 'Preferred side (default top)'
				},
				{
					name: 'describe',
					type: 'boolean',
					descr: 'Set aria-describedby on the trigger (default true)'
				},
				{ name: 'disabled', type: 'boolean', descr: 'Turn the tooltip off' },
				{ name: 'children', type: 'React.ReactElement', descr: 'Single trigger element' }
			]}
		>
			<Variant name="On any element">
				<div className="c-hbox g-2">
					<Tooltip content="Shared with 3 people">
						<Button variant="soft" icon={<IcShare />}>
							Shared
						</Button>
					</Tooltip>
					<Tooltip content="Below" placement="bottom">
						<Button>Bottom</Button>
					</Tooltip>
				</div>
			</Variant>

			<Variant name="Icon-only Button (automatic)">
				<div className="c-hbox g-2">
					<Button variant="ghost" icon={<IcHeart />} aria-label="Like" />
					<Button variant="ghost" icon={<IcShare />} aria-label="Share" />
				</div>
			</Variant>
		</Story>
	)
}

export function PopperStory() {
	return (
		<Story
			name="Popper"
			description="Dropdown menu component using Popper.js for positioning. Automatically manages open/close state and positioning."
			props={[
				{
					name: 'className',
					type: 'string',
					descr: 'Additional CSS classes for container'
				},
				{ name: 'menuClassName', type: 'string', descr: 'CSS classes for menu trigger' },
				{ name: 'icon', type: 'React.ReactNode', descr: 'Icon for menu trigger' },
				{ name: 'label', type: 'React.ReactNode', descr: 'Label for menu trigger' },
				{ name: 'children', type: 'React.ReactNode', descr: 'Menu content' }
			]}
		>
			<Variant name="Popper Menu">
				<Popper icon={<IcMore />} label="Options">
					<div className="c-nav flex-column">
						<button className="c-nav-item">Edit</button>
						<button className="c-nav-item">Delete</button>
						<button className="c-nav-item">Share</button>
					</div>
				</Popper>
			</Variant>

			<Variant name="Popper with Icon Only">
				<Popper icon={<IcMore />}>
					<div className="c-nav flex-column">
						<button className="c-nav-item">Option 1</button>
						<button className="c-nav-item">Option 2</button>
						<button className="c-nav-item">Option 3</button>
					</div>
				</Popper>
			</Variant>
		</Story>
	)
}

export function ContainerStory() {
	return (
		<Story
			name="Container"
			description="Main content container component with responsive styling and overflow handling."
			props={[
				{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
				{
					name: 'children',
					type: 'React.ReactNode',
					descr: 'Container content',
					required: true
				}
			]}
		>
			<Variant name="Basic Container">
				<div style={{ height: '200px', border: '1px solid #ccc' }}>
					<div className="c-container">
						<h3>Container Content</h3>
						<p>This is a basic container with standard styling.</p>
						<p>It provides consistent spacing and overflow handling.</p>
					</div>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
