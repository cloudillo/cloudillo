import { Avatar, Badge, BadgeAnchor, Button, HBox } from '@cloudillo/react'
import * as React from 'react'
import { LuBell as IcBell, LuCheck as IcCheck, LuTriangleAlert as IcWarn } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function BadgeStory() {
	return (
		<Story
			name="Badge"
			description="Non-interactive status or count label. For clickable chips use Tag. Corner overlays go through BadgeAnchor."
			props={[
				{ name: 'color', type: 'ColorVariant', descr: 'Tone' },
				{
					name: 'variant',
					type: "'filled' | 'soft' | 'outline'",
					descr: 'Fill style (default filled)'
				},
				{ name: 'size', type: 'Size', descr: 'Badge size' },
				{ name: 'icon', type: 'ReactNode', descr: 'Leading icon' },
				{
					name: 'dot',
					type: 'boolean',
					descr: 'Text-less dot; requires aria-label'
				},
				{
					name: 'BadgeAnchor badge',
					type: 'ReactNode',
					descr: 'Overlay rendered on a corner of the child'
				},
				{
					name: 'BadgeAnchor position',
					type: "'top-end' | 'top-start' | 'bottom-end' | 'bottom-start'",
					descr: 'Logical corner (default top-end)'
				}
			]}
		>
			<Variant name="Filled">
				<HBox gap={2} wrap>
					<Badge>Default</Badge>
					<Badge color="primary">Primary</Badge>
					<Badge color="accent">Accent</Badge>
					<Badge color="error">Error</Badge>
					<Badge color="warning">Warning</Badge>
					<Badge color="success">Success</Badge>
				</HBox>
			</Variant>

			<Variant name="Soft and Outline">
				<HBox gap={2} wrap>
					<Badge variant="soft" color="primary">
						Soft
					</Badge>
					<Badge variant="soft" color="success">
						Active
					</Badge>
					<Badge variant="soft" color="neutral">
						Draft
					</Badge>
					<Badge variant="outline" color="warning">
						Outline
					</Badge>
					<Badge variant="outline" color="error">
						Blocked
					</Badge>
				</HBox>
			</Variant>

			<Variant name="Sizes">
				<HBox gap={2} className="align-items-center">
					<Badge size="xs">xs</Badge>
					<Badge size="sm">sm</Badge>
					<Badge>md</Badge>
					<Badge size="lg">lg</Badge>
					<Badge size="xl">xl</Badge>
				</HBox>
			</Variant>

			<Variant name="With Icon (status never by colour alone)">
				<HBox gap={2}>
					<Badge variant="soft" color="success" icon={<IcCheck />}>
						Verified
					</Badge>
					<Badge variant="soft" color="warning" icon={<IcWarn />}>
						Expiring
					</Badge>
				</HBox>
			</Variant>

			<Variant name="Dot">
				<HBox gap={2} className="align-items-center">
					<Badge dot color="success" aria-label="Online" />
					<Badge dot color="warning" aria-label="Away" />
					<Badge dot size="lg" color="error" aria-label="Offline" />
				</HBox>
			</Variant>

			<Variant name="BadgeAnchor">
				<HBox gap={4} className="align-items-center">
					<BadgeAnchor
						badge={
							<Badge color="error" size="sm">
								3
							</Badge>
						}
					>
						<Button variant="ghost" icon={<IcBell />} aria-label="Notifications" />
					</BadgeAnchor>
					<BadgeAnchor
						position="bottom-end"
						badge={<Badge dot color="success" aria-label="Online" />}
					>
						<Avatar alt="Alice" />
					</BadgeAnchor>
					<BadgeAnchor
						position="top-start"
						badge={
							<Badge color="primary" size="xs">
								New
							</Badge>
						}
					>
						<Avatar alt="Bob" />
					</BadgeAnchor>
				</HBox>
			</Variant>
		</Story>
	)
}

// vim: ts=4
