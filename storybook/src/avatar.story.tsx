import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Avatar, AvatarStatus, AvatarBadge, AvatarGroup } from '@cloudillo/react'

export function AvatarStory() {
	return <Story
		name="Avatar"
		description="Avatar component for displaying user profile images with status indicators, badges, and grouping support."
		props={[
			{ name: 'size', type: '"xs" | "sm" | "md" | "lg" | "xl"', descr: 'Avatar size' },
			{ name: 'shape', type: '"circle" | "square" | "rounded"', descr: 'Avatar shape' },
			{ name: 'ring', type: 'boolean | "secondary" | "success"', descr: 'Ring highlight around avatar' },
			{ name: 'src', type: 'string', descr: 'Image URL' },
			{ name: 'alt', type: 'string', descr: 'Image alt text' },
			{ name: 'fallback', type: 'React.ReactNode', descr: 'Fallback content (initials or icon)' }
		]}
	>
		<Variant name="Sizes">
			<div className="c-hbox g-2 align-items-end">
				<Avatar size="xs" fallback="XS"/>
				<Avatar size="sm" fallback="SM"/>
				<Avatar size="md" fallback="MD"/>
				<Avatar size="lg" fallback="LG"/>
				<Avatar size="xl" fallback="XL"/>
			</div>
		</Variant>

		<Variant name="Shapes">
			<div className="c-hbox g-2">
				<Avatar fallback="C"/>
				<Avatar shape="square" fallback="S"/>
				<Avatar shape="rounded" fallback="R"/>
			</div>
		</Variant>

		<Variant name="With Ring">
			<div className="c-hbox g-2">
				<Avatar ring fallback="R"/>
				<Avatar ring="secondary" fallback="S"/>
				<Avatar ring="success" fallback="OK"/>
			</div>
		</Variant>

		<Variant name="With Status">
			<div className="c-hbox g-2">
				<Avatar fallback="ON">
					<AvatarStatus status="online"/>
				</Avatar>
				<Avatar fallback="OF">
					<AvatarStatus status="offline"/>
				</Avatar>
				<Avatar fallback="BU">
					<AvatarStatus status="busy"/>
				</Avatar>
				<Avatar fallback="AW">
					<AvatarStatus status="away"/>
				</Avatar>
			</div>
		</Variant>

		<Variant name="With Badge">
			<div className="c-hbox g-2">
				<Avatar fallback="JD">
					<AvatarBadge count={5}/>
				</Avatar>
				<Avatar fallback="JD">
					<AvatarBadge variant="error" count={99}/>
				</Avatar>
			</div>
		</Variant>

		<Variant name="Avatar Group">
			<AvatarGroup>
				<Avatar fallback="A"/>
				<Avatar fallback="B"/>
				<Avatar fallback="C"/>
				<Avatar fallback="D"/>
			</AvatarGroup>
		</Variant>

		<Variant name="Avatar Group with Max">
			<AvatarGroup max={3}>
				<Avatar fallback="A"/>
				<Avatar fallback="B"/>
				<Avatar fallback="C"/>
				<Avatar fallback="D"/>
				<Avatar fallback="E"/>
			</AvatarGroup>
		</Variant>
	</Story>
}

// vim: ts=4
