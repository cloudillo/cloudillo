import { Heading, Icon, Text, VisuallyHidden } from '@cloudillo/react'
import * as React from 'react'
import { LuBell as IcBell, LuHeart as IcHeart, LuStar as IcStar } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

export function TypographyStory() {
	return (
		<Story
			name="Typography"
			description="Text, Heading and VisuallyHidden — text styling without raw span/p/h* elements."
			props={[
				{
					name: 'as',
					type: "'span' | 'p' | 'div' | 'label'",
					descr: 'Text: element (default span)'
				},
				{
					name: 'size',
					type: "'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl'",
					descr: 'Font size'
				},
				{ name: 'color', type: 'ColorVariant', descr: 'Text: hue' },
				{
					name: 'emphasis',
					type: "'muted' | 'disabled' | 'strong'",
					descr: 'Text: opacity/em axis'
				},
				{
					name: 'weight',
					type: "'normal' | 'medium' | 'semibold' | 'bold'",
					descr: 'Text: font weight'
				},
				{
					name: 'truncate',
					type: 'true | 2 | 3 | 4',
					descr: 'Text: ellipsis or line clamp'
				},
				{
					name: 'align / mono / preWrap',
					type: 'string / boolean / boolean',
					descr: 'Text: alignment, monospace, keep whitespace'
				},
				{
					name: 'level',
					type: '1-6',
					descr: 'Heading: outline level; size defaults from it'
				},
				{ name: 'overline', type: 'boolean', descr: 'Heading: small uppercase label' }
			]}
		>
			<Variant name="Text sizes">
				<div className="c-vbox g-1">
					<Text size="xs">xs — The quick brown fox</Text>
					<Text size="sm">sm — The quick brown fox</Text>
					<Text size="base">base — The quick brown fox</Text>
					<Text size="lg">lg — The quick brown fox</Text>
					<Text size="xl">xl — The quick brown fox</Text>
					<Text size="2xl">2xl — The quick brown fox</Text>
					<Text size="3xl">3xl — The quick brown fox</Text>
				</div>
			</Variant>

			<Variant name="Emphasis and weight">
				<div className="c-vbox g-1">
					<Text emphasis="strong">Strong</Text>
					<Text>Default</Text>
					<Text emphasis="muted">Muted</Text>
					<Text emphasis="disabled">Disabled</Text>
					<Text weight="semibold">Semibold</Text>
					<Text weight="bold">Bold</Text>
				</div>
			</Variant>

			<Variant name="Colors">
				<div className="c-hbox g-2 flex-wrap">
					<Text color="primary">primary</Text>
					<Text color="secondary">secondary</Text>
					<Text color="accent">accent</Text>
					<Text color="neutral">neutral</Text>
					<Text color="info">info</Text>
					<Text color="success">success</Text>
					<Text color="warning">warning</Text>
					<Text color="error">error</Text>
				</div>
			</Variant>

			<Variant name="Truncate, mono, preWrap">
				<div className="c-vbox g-2 mw-sm">
					<Text truncate>
						A single line that is far too long to fit and ends with an ellipsis
					</Text>
					<Text as="p" truncate={2}>
						A paragraph clamped to two lines. It keeps going well beyond the second line
						so the clamp is visible in the story.
					</Text>
					<Text mono>const x = 42</Text>
					<Text as="div" preWrap>
						{'line one\n    indented line two'}
					</Text>
				</div>
			</Variant>

			<Variant name="Headings">
				<div className="c-vbox g-1">
					<Heading level={1}>Heading 1</Heading>
					<Heading level={2}>Heading 2</Heading>
					<Heading level={3}>Heading 3</Heading>
					<Heading level={4}>Heading 4</Heading>
					<Heading level={2} size="lg">
						h2 with size lg
					</Heading>
					<Heading level={3} size="xs" overline>
						Overline label
					</Heading>
				</div>
			</Variant>

			<Variant name="VisuallyHidden">
				<button type="button" className="c-button">
					<Icon as={IcBell} />
					<VisuallyHidden>Notifications</VisuallyHidden>
				</button>
			</Variant>
		</Story>
	)
}

export function IconStory() {
	return (
		<Story
			name="Icon"
			description="Wraps an icon component; decorative (aria-hidden) unless it has a label."
			props={[
				{
					name: 'as',
					type: 'ComponentType<SVGAttributes>',
					descr: 'Icon component, e.g. LuStar'
				},
				{ name: 'size', type: 'Size', descr: 'xs–xl; omitted inherits font size' },
				{ name: 'color', type: 'ColorVariant', descr: 'Tint' },
				{ name: 'label', type: 'string', descr: 'Accessible name → role="img"' }
			]}
		>
			<Variant name="Sizes">
				<div className="c-hbox g-2 align-items-center">
					<Icon as={IcStar} size="xs" />
					<Icon as={IcStar} size="sm" />
					<Icon as={IcStar} size="md" />
					<Icon as={IcStar} size="lg" />
					<Icon as={IcStar} size="xl" />
				</div>
			</Variant>

			<Variant name="Colors and label">
				<div className="c-hbox g-2 align-items-center">
					<Icon as={IcHeart} size="lg" color="error" label="Favourite" />
					<Icon as={IcStar} size="lg" color="warning" />
					<Icon as={IcBell} size="lg" color="info" />
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
