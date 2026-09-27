import { Button, Card, Divider, Grid, HBox, Panel, Text, VBox } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

const SURFACE_PROPS = [
	{ name: 'color', type: 'ColorVariant', descr: 'Tone' },
	{
		name: 'variant',
		type: '"filled" | "soft" | "outline" | "plain"',
		descr: 'Shape (default filled)'
	},
	{ name: 'padding', type: '0-5', descr: 'Padding step' },
	{ name: 'elevation', type: '"low" | "mid" | "high"', descr: 'Elevation level' },
	{
		name: 'href',
		type: 'string',
		descr: '"/…" → router Link, absolute → <a>; whole surface interactive'
	},
	{
		name: 'onClick',
		type: 'MouseEventHandler',
		descr: 'Without href: surface renders as <button>'
	},
	{ name: 'title', type: 'ReactNode', descr: 'Header title → <section aria-labelledby>' },
	{ name: 'description', type: 'ReactNode', descr: 'Muted text under the title' },
	{
		name: 'actions',
		type: 'ReactNode',
		descr: 'Trailing header slot (stays clickable on interactive surfaces)'
	},
	{ name: 'headingLevel', type: '1-6', descr: 'Title heading level (Panel 2, Card 3)' }
]

export function PanelStory() {
	return (
		<Story
			name="Panel"
			description="Region surface (settings section, sidebar block, page body). Shares its props with Card."
			props={[
				...SURFACE_PROPS,
				{ name: 'emph', type: 'boolean', descr: 'Emphasized state with inset shadow' }
			]}
		>
			<Variant name="Color Variants">
				<HBox gap={2} wrap>
					<Panel padding={3}>Default</Panel>
					<Panel color="primary" padding={3}>
						Primary
					</Panel>
					<Panel color="secondary" padding={3}>
						Secondary
					</Panel>
					<Panel color="accent" padding={3}>
						Accent
					</Panel>
					<Panel color="neutral" padding={3}>
						Neutral
					</Panel>
					<Panel color="info" padding={3}>
						Info
					</Panel>
					<Panel color="error" padding={3}>
						Error
					</Panel>
					<Panel color="warning" padding={3}>
						Warning
					</Panel>
					<Panel color="success" padding={3}>
						Success
					</Panel>
				</HBox>
			</Variant>

			<Variant name="Shape Variants">
				<HBox gap={2} wrap>
					<Panel padding={3}>Filled</Panel>
					<Panel variant="soft" padding={3}>
						Soft
					</Panel>
					<Panel variant="outline" padding={3}>
						Outline
					</Panel>
					<Panel variant="plain">Plain</Panel>
					<Panel variant="soft" color="primary" padding={3}>
						Soft primary
					</Panel>
					<Panel variant="outline" color="error" padding={3}>
						Outline error
					</Panel>
				</HBox>
			</Variant>

			<Variant name="Elevation Levels">
				<HBox gap={2}>
					<Panel elevation="low" padding={3}>
						Low
					</Panel>
					<Panel elevation="mid" padding={3}>
						Mid
					</Panel>
					<Panel elevation="high" padding={3}>
						High
					</Panel>
				</HBox>
			</Variant>

			<Variant name="Emphasized">
				<HBox gap={2}>
					<Panel emph padding={3}>
						Emphasized
					</Panel>
					<Panel color="primary" emph padding={3}>
						Primary Emph
					</Panel>
				</HBox>
			</Variant>

			<Variant name="Titled Panel">
				<Panel
					title="Notifications"
					description="Choose what you are notified about."
					actions={<Button variant="ghost">Reset</Button>}
					style={{ maxWidth: '400px' }}
				>
					<Text as="p">Panel body content.</Text>
				</Panel>
			</Variant>

			<Variant name="Titled block without surface">
				<Panel variant="plain" title="Security" description="Plain variant = titled block">
					<Text as="p">No background, no padding.</Text>
				</Panel>
			</Variant>
		</Story>
	)
}

export function CardStory() {
	return (
		<Story
			name="Card"
			description="Repeated item surface (post, tile, activity). Same props as Panel; heading level defaults to 3."
			props={[
				...SURFACE_PROPS,
				{ name: 'interactive', type: 'boolean', descr: 'Legacy: hover styling only' }
			]}
		>
			<Variant name="Plain Cards">
				<Grid min="12rem" gap={2}>
					<Card>Default card</Card>
					<Card variant="soft">Soft</Card>
					<Card variant="outline">Outline</Card>
					<Card color="info">Info</Card>
				</Grid>
			</Variant>

			<Variant name="Interactive (whole surface)">
				<Grid min="12rem" gap={2}>
					<Card href="/">
						<Text weight="semibold">Router link</Text>
						<Text emphasis="muted">href="/…"</Text>
					</Card>
					<Card href="https://cloudillo.org">
						<Text weight="semibold">External link</Text>
						<Text emphasis="muted">absolute href → &lt;a rel="noopener"&gt;</Text>
					</Card>
					<Card onClick={() => alert('clicked')}>
						<Text weight="semibold">Button</Text>
						<Text emphasis="muted">onClick without href</Text>
					</Card>
				</Grid>
			</Variant>

			<Variant name="Titled, interactive with actions (stretched link)">
				<Grid min="16rem" gap={2}>
					<Card
						title="Quarterly report"
						description="Edited 2 hours ago"
						href="/"
						actions={
							<Button variant="ghost" onClick={() => alert('menu')}>
								⋯
							</Button>
						}
					>
						<Text emphasis="muted" truncate={2}>
							The title link covers the card; the action button stays separately
							clickable.
						</Text>
					</Card>
					<Card title="Static card" description="Titled, not interactive">
						<Text>Renders as &lt;section aria-labelledby&gt;.</Text>
					</Card>
				</Grid>
			</Variant>
		</Story>
	)
}

export function DividerStory() {
	return (
		<Story
			name="Divider"
			description='Separator line, optionally labelled. role="separator" + aria-label.'
			props={[
				{ name: 'label', type: 'string', descr: 'Visible and announced label' },
				{ name: 'color', type: 'ColorVariant', descr: 'Line/label tone' },
				{
					name: 'orientation',
					type: '"horizontal" | "vertical"',
					descr: 'Default horizontal'
				}
			]}
		>
			<Variant name="Horizontal">
				<VBox gap={2}>
					<Divider />
					<Divider label="Today" />
					<Divider label="New messages" color="primary" />
					<Divider color="error" />
				</VBox>
			</Variant>

			<Variant name="Vertical">
				<HBox align="stretch" style={{ height: '3rem' }}>
					<Text>Left</Text>
					<Divider orientation="vertical" />
					<Text>Right</Text>
					<Divider orientation="vertical" label="or" />
					<Text>Other</Text>
				</HBox>
			</Variant>
		</Story>
	)
}

// vim: ts=4
