import * as React from 'react'
import { Story, Variant } from './storybook.js'

// Token value display component
function TokenValue({
	name,
	value,
	preview
}: {
	name: string
	value: string
	preview?: React.ReactNode
}) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0' }}>
			<code style={{ flex: '0 0 auto', minWidth: '180px', fontSize: '0.85rem' }}>{name}</code>
			<span
				style={{
					flex: '0 0 auto',
					minWidth: '120px',
					fontFamily: 'monospace',
					fontSize: '0.85rem',
					color: 'var(--col-on-container)'
				}}
			>
				{value}
			</span>
			{preview}
		</div>
	)
}

// Color swatch component
function ColorSwatch({ color, size = 32 }: { color: string; size?: number }) {
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: 'var(--radius-sm)',
				background: `var(${color})`,
				border: '1px solid var(--col-outline)'
			}}
		/>
	)
}

// Spacing visualization
function SpacingBox({ space }: { space: string }) {
	return (
		<div
			style={{
				width: `var(${space})`,
				height: '1.5rem',
				background: 'var(--col-primary)',
				borderRadius: 'var(--radius-sm)',
				minWidth: '4px'
			}}
		/>
	)
}

// Radius visualization
function RadiusBox({ radius }: { radius: string }) {
	return (
		<div
			style={{
				width: '3rem',
				height: '3rem',
				background: 'var(--col-container-high)',
				border: '2px solid var(--col-primary)',
				borderRadius: `var(${radius})`
			}}
		/>
	)
}

// Shadow visualization
function ShadowBox({ shadow }: { shadow: string }) {
	return (
		<div
			style={{
				width: '4rem',
				height: '3rem',
				background: 'var(--col-container)',
				borderRadius: 'var(--radius-md)',
				boxShadow: `var(${shadow})`
			}}
		/>
	)
}

export function TokensStory() {
	return (
		<Story
			name="tokens"
			path="tokens"
			title="Design Tokens"
			description="Design tokens are the visual design atoms of the design system. They define spacing, sizing, colors, shadows, and timing values used throughout Cloudillo components."
		>
			<Variant
				name="Spacing Scale"
				description="Used for margins, paddings, and gaps. Scale uses 0.25rem increments (4px base at 16px root)."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue
						name="--space-0"
						value="0"
						preview={<SpacingBox space="--space-0" />}
					/>
					<TokenValue
						name="--space-1"
						value="0.25rem (4px)"
						preview={<SpacingBox space="--space-1" />}
					/>
					<TokenValue
						name="--space-2"
						value="0.5rem (8px)"
						preview={<SpacingBox space="--space-2" />}
					/>
					<TokenValue
						name="--space-3"
						value="1rem (16px)"
						preview={<SpacingBox space="--space-3" />}
					/>
					<TokenValue
						name="--space-4"
						value="2rem (32px)"
						preview={<SpacingBox space="--space-4" />}
					/>
					<TokenValue
						name="--space-5"
						value="4rem (64px)"
						preview={<SpacingBox space="--space-5" />}
					/>
				</div>
			</Variant>

			<Variant name="Typography Scale" description="Font sizes following a modular scale.">
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue
						name="--text-xs"
						value="0.75rem (12px)"
						preview={<span style={{ fontSize: 'var(--text-xs)' }}>Sample Text</span>}
					/>
					<TokenValue
						name="--text-sm"
						value="0.875rem (14px)"
						preview={<span style={{ fontSize: 'var(--text-sm)' }}>Sample Text</span>}
					/>
					<TokenValue
						name="--text-base"
						value="1rem (16px)"
						preview={<span style={{ fontSize: 'var(--text-base)' }}>Sample Text</span>}
					/>
					<TokenValue
						name="--text-lg"
						value="1.125rem (18px)"
						preview={<span style={{ fontSize: 'var(--text-lg)' }}>Sample Text</span>}
					/>
					<TokenValue
						name="--text-xl"
						value="1.25rem (20px)"
						preview={<span style={{ fontSize: 'var(--text-xl)' }}>Sample Text</span>}
					/>
					<TokenValue
						name="--text-2xl"
						value="1.5rem (24px)"
						preview={<span style={{ fontSize: 'var(--text-2xl)' }}>Sample Text</span>}
					/>
					<TokenValue
						name="--text-3xl"
						value="1.875rem (30px)"
						preview={<span style={{ fontSize: 'var(--text-3xl)' }}>Sample Text</span>}
					/>
					<TokenValue
						name="--text-4xl"
						value="2.25rem (36px)"
						preview={<span style={{ fontSize: 'var(--text-4xl)' }}>Sample Text</span>}
					/>
				</div>
			</Variant>

			<Variant name="Border Radius" description="Border radius values for rounded corners.">
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
					<TokenValue
						name="--radius-none"
						value="0"
						preview={<RadiusBox radius="--radius-none" />}
					/>
					<TokenValue
						name="--radius-sm"
						value="0.25rem (4px)"
						preview={<RadiusBox radius="--radius-sm" />}
					/>
					<TokenValue
						name="--radius-md"
						value="0.5rem (8px)"
						preview={<RadiusBox radius="--radius-md" />}
					/>
					<TokenValue
						name="--radius-lg"
						value="1rem (16px)"
						preview={<RadiusBox radius="--radius-lg" />}
					/>
					<TokenValue
						name="--radius-xl"
						value="1.5rem (24px)"
						preview={<RadiusBox radius="--radius-xl" />}
					/>
					<TokenValue
						name="--radius-full"
						value="9999px"
						preview={<RadiusBox radius="--radius-full" />}
					/>
				</div>
			</Variant>

			<Variant
				name="Z-Index Scale"
				description="Layering system for stacking contexts. Use these to ensure proper layering of overlays, modals, and tooltips."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue name="--z-base" value="0" />
					<TokenValue name="--z-dropdown" value="100" />
					<TokenValue name="--z-sticky" value="200" />
					<TokenValue name="--z-fixed" value="300" />
					<TokenValue name="--z-sidebar" value="400" />
					<TokenValue name="--z-modal-backdrop" value="500" />
					<TokenValue name="--z-modal" value="600" />
					<TokenValue name="--z-popover" value="700" />
					<TokenValue name="--z-tooltip" value="800" />
					<TokenValue name="--z-toast" value="900" />
				</div>
			</Variant>

			<Variant name="Shadows" description="Box shadow presets for elevation.">
				<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
					<TokenValue
						name="--shadow-sm"
						value="0 1px 2px..."
						preview={<ShadowBox shadow="--shadow-sm" />}
					/>
					<TokenValue
						name="--shadow-md"
						value="0 4px 6px..."
						preview={<ShadowBox shadow="--shadow-md" />}
					/>
					<TokenValue
						name="--shadow-lg"
						value="0 10px 15px..."
						preview={<ShadowBox shadow="--shadow-lg" />}
					/>
					<TokenValue
						name="--shadow-xl"
						value="0 20px 25px..."
						preview={<ShadowBox shadow="--shadow-xl" />}
					/>
				</div>
			</Variant>

			<Variant
				name="Component Sizing"
				description="Standard heights for interactive elements like buttons and inputs."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue
						name="--size-xs"
						value="1.5rem (24px)"
						preview={
							<div
								style={{
									width: '4rem',
									height: 'var(--size-xs)',
									background: 'var(--col-primary)',
									borderRadius: 'var(--radius-sm)'
								}}
							/>
						}
					/>
					<TokenValue
						name="--size-sm"
						value="2rem (32px)"
						preview={
							<div
								style={{
									width: '4rem',
									height: 'var(--size-sm)',
									background: 'var(--col-primary)',
									borderRadius: 'var(--radius-sm)'
								}}
							/>
						}
					/>
					<TokenValue
						name="--size-md"
						value="2.5rem (40px)"
						preview={
							<div
								style={{
									width: '4rem',
									height: 'var(--size-md)',
									background: 'var(--col-primary)',
									borderRadius: 'var(--radius-sm)'
								}}
							/>
						}
					/>
					<TokenValue
						name="--size-lg"
						value="3rem (48px)"
						preview={
							<div
								style={{
									width: '4rem',
									height: 'var(--size-lg)',
									background: 'var(--col-primary)',
									borderRadius: 'var(--radius-sm)'
								}}
							/>
						}
					/>
					<TokenValue
						name="--size-xl"
						value="4rem (64px)"
						preview={
							<div
								style={{
									width: '4rem',
									height: 'var(--size-xl)',
									background: 'var(--col-primary)',
									borderRadius: 'var(--radius-sm)'
								}}
							/>
						}
					/>
				</div>
			</Variant>

			<Variant
				name="Durations & Easing"
				description="Animation timing values for consistent motion."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<h4 style={{ margin: '0.5rem 0', color: 'var(--col-on)' }}>Durations</h4>
					<TokenValue name="--duration-instant" value="100ms" />
					<TokenValue name="--duration-fast" value="150ms" />
					<TokenValue name="--duration-normal" value="300ms" />
					<TokenValue name="--duration-slow" value="500ms" />
					<TokenValue name="--duration-slower" value="700ms" />
					<h4 style={{ margin: '0.5rem 0', color: 'var(--col-on)' }}>Easing Functions</h4>
					<TokenValue name="--ease-default" value="cubic-bezier(0.4, 0, 0.2, 1)" />
					<TokenValue name="--ease-in" value="cubic-bezier(0.4, 0, 1, 1)" />
					<TokenValue name="--ease-out" value="cubic-bezier(0, 0, 0.2, 1)" />
					<TokenValue name="--ease-in-out" value="cubic-bezier(0.4, 0, 0.2, 1)" />
					<TokenValue name="--ease-spring" value="cubic-bezier(0.34, 1.56, 0.64, 1)" />
					<TokenValue
						name="--ease-bounce"
						value="cubic-bezier(0.68, -0.55, 0.265, 1.55)"
					/>
				</div>
			</Variant>

			<Variant
				name="Animation Presets"
				description="Composite timing for common animation patterns."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue name="--anim-stagger-base" value="50ms" />
					<TokenValue name="--anim-page-enter" value="400ms ease-out" />
					<TokenValue name="--anim-hover" value="200ms ease-out" />
					<TokenValue name="--anim-press" value="150ms ease-in-out" />
					<TokenValue name="--anim-modal" value="300ms spring" />
					<TokenValue name="--anim-toast" value="300ms ease-out" />
				</div>
			</Variant>

			<Variant
				name="Accessibility Tokens"
				description="Focus states and touch targets for better accessibility (WCAG compliance)."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue name="--focus-ring-width" value="3px" />
					<TokenValue name="--focus-ring-offset" value="2px" />
					<TokenValue
						name="--focus-ring-color"
						value="var(--col-primary)"
						preview={<ColorSwatch color="--focus-ring-color" />}
					/>
					<TokenValue name="--min-touch-target" value="44px" />
				</div>
			</Variant>
		</Story>
	)
}

export function ColorsStory() {
	return (
		<Story
			name="colors"
			path="colors"
			title="Color System"
			description="The Cloudillo color system uses semantic color tokens that adapt to light/dark mode and different themes (glass, opaque)."
		>
			<Variant
				name="Primary Colors"
				description="Main brand colors used for primary actions and emphasis."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue
						name="--col-primary"
						value="Brand primary"
						preview={<ColorSwatch color="--col-primary" size={40} />}
					/>
					<TokenValue
						name="--col-secondary"
						value="Brand secondary"
						preview={<ColorSwatch color="--col-secondary" size={40} />}
					/>
					<TokenValue
						name="--col-accent"
						value="Accent color"
						preview={<ColorSwatch color="--col-accent" size={40} />}
					/>
				</div>
			</Variant>

			<Variant
				name="Semantic Colors"
				description="Colors with specific meanings used for feedback and status."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue
						name="--col-success"
						value="Success state"
						preview={<ColorSwatch color="--col-success" size={40} />}
					/>
					<TokenValue
						name="--col-warning"
						value="Warning state"
						preview={<ColorSwatch color="--col-warning" size={40} />}
					/>
					<TokenValue
						name="--col-error"
						value="Error state"
						preview={<ColorSwatch color="--col-error" size={40} />}
					/>
				</div>
			</Variant>

			<Variant
				name="Surface Colors"
				description="Background and container colors with varying emphasis levels."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue
						name="--col-bg"
						value="Base background"
						preview={<ColorSwatch color="--col-bg" size={40} />}
					/>
					<TokenValue
						name="--col-surface"
						value="Surface layer"
						preview={<ColorSwatch color="--col-surface" size={40} />}
					/>
					<TokenValue
						name="--col-container-low"
						value="Low emphasis container"
						preview={<ColorSwatch color="--col-container-low" size={40} />}
					/>
					<TokenValue
						name="--col-container"
						value="Default container"
						preview={<ColorSwatch color="--col-container" size={40} />}
					/>
					<TokenValue
						name="--col-container-high"
						value="High emphasis container"
						preview={<ColorSwatch color="--col-container-high" size={40} />}
					/>
				</div>
			</Variant>

			<Variant name="Text Colors" description="Text colors with different emphasis levels.">
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue
						name="--col-on"
						value="Primary text"
						preview={<span style={{ color: 'var(--col-on)' }}>Sample Text</span>}
					/>
					<TokenValue
						name="--col-on-container"
						value="Container text"
						preview={
							<span style={{ color: 'var(--col-on-container)' }}>Sample Text</span>
						}
					/>
					<TokenValue
						name="--col-on-surface"
						value="Surface text"
						preview={
							<span style={{ color: 'var(--col-on-surface)' }}>Sample Text</span>
						}
					/>
					<TokenValue
						name="--col-on-primary"
						value="Text on primary"
						preview={
							<span
								style={{
									background: 'var(--col-primary)',
									color: 'var(--col-on-primary)',
									padding: '0.25rem 0.5rem',
									borderRadius: '0.25rem'
								}}
							>
								Sample Text
							</span>
						}
					/>
				</div>
			</Variant>

			<Variant
				name="Border Colors"
				description="Border and outline colors for separators and component boundaries."
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<TokenValue
						name="--col-outline"
						value="Default outline"
						preview={
							<div
								style={{
									width: '3rem',
									height: '1.5rem',
									border: '2px solid var(--col-outline)',
									borderRadius: 'var(--radius-sm)'
								}}
							/>
						}
					/>
					<TokenValue
						name="--col-outline-low"
						value="Subtle outline"
						preview={
							<div
								style={{
									width: '3rem',
									height: '1.5rem',
									border: '2px solid var(--col-outline-low)',
									borderRadius: 'var(--radius-sm)'
								}}
							/>
						}
					/>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
