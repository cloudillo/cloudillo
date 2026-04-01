// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * WrappedText component - renders text with word wrapping and alignment in SVG
 * Uses foreignObject with HTML div for native CSS text layout capabilities
 */

import type { ResolvedTextStyle } from '../crdt'
import { TEXT_ALIGN_CSS, VERTICAL_ALIGN_CSS, getTextDecorationCSS } from '../utils/text-styles'
import { getBulletIcon, migrateBullet } from '../data/bullet-icons'

interface WrappedTextProps {
	x: number
	y: number
	width: number
	height: number
	text: string
	textStyle: ResolvedTextStyle
	isPlaceholder?: boolean
}

/**
 * Inline SVG bullet icon component
 * Renders bullet as inline SVG within HTML content
 */
function BulletIcon({ bulletId, size, color }: { bulletId: string; size: number; color: string }) {
	const icon = getBulletIcon(bulletId)
	if (!icon) return null

	const [vbX, vbY, vbW, vbH] = icon.viewBox

	return (
		<svg
			width={size}
			height={size}
			viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
			style={{
				display: 'inline-block',
				verticalAlign: 'middle',
				flexShrink: 0
			}}
		>
			<path d={icon.pathData} fill={color} />
		</svg>
	)
}

export function WrappedText({
	x,
	y,
	width,
	height,
	text,
	textStyle,
	isPlaceholder = false
}: WrappedTextProps) {
	const textDecorationCSS = getTextDecorationCSS(textStyle.textDecoration)

	// Migrate bullet ID if it's an old Unicode bullet
	const bulletId = migrateBullet(textStyle.listBullet)
	const bulletIcon = bulletId ? getBulletIcon(bulletId) : null

	// Calculate bullet sizing relative to font size (60% for good visibility)
	const bulletSize = textStyle.fontSize * 0.6
	const bulletGap = textStyle.fontSize * 0.3

	// If we have a bullet, render lines with bullet icons
	const renderContent = () => {
		if (!bulletIcon) {
			// No bullet - render text normally
			return text
		}

		// Split into lines and render each with a bullet
		const lines = text.split('\n')
		const textColor = isPlaceholder ? '#999999' : textStyle.fill

		return lines.map((line, index) => {
			// Empty lines - no bullet, just preserve the line
			if (line.trim() === '') {
				return (
					<div
						key={index}
						style={{ minHeight: `${textStyle.fontSize * textStyle.lineHeight}px` }}
					>
						{'\u00A0'}
					</div>
				)
			}

			// Find leading whitespace and content
			const match = line.match(/^(\s*)(.*)$/)
			const leadingSpace = match ? match[1] : ''
			const content = match ? match[2] : line

			return (
				<div
					key={index}
					style={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: `${bulletGap}px`
					}}
				>
					{/* Indentation space */}
					{leadingSpace && <span style={{ whiteSpace: 'pre' }}>{leadingSpace}</span>}
					{/* Bullet icon - aligned with text x-height center */}
					<span
						style={{
							display: 'flex',
							alignItems: 'center',
							height: `${textStyle.fontSize * textStyle.lineHeight}px`,
							marginTop: `${0.1 * textStyle.fontSize}px`,
							flexShrink: 0
						}}
					>
						<BulletIcon bulletId={bulletId!} size={bulletSize} color={textColor} />
					</span>
					{/* Text content */}
					<span style={{ flex: 1 }}>{content}</span>
				</div>
			)
		})
	}

	return (
		<foreignObject x={x} y={y} width={width} height={height} style={{ overflow: 'visible' }}>
			<div
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					alignItems: VERTICAL_ALIGN_CSS[textStyle.verticalAlign] || 'flex-start',
					overflow: 'visible',
					pointerEvents: 'none'
				}}
			>
				<div
					style={{
						width: '100%',
						fontFamily: textStyle.fontFamily,
						fontSize: `${textStyle.fontSize}px`,
						fontWeight: textStyle.fontWeight,
						fontStyle: isPlaceholder
							? 'italic'
							: textStyle.fontItalic
								? 'italic'
								: 'normal',
						color: isPlaceholder ? '#999999' : textStyle.fill,
						lineHeight: textStyle.lineHeight,
						letterSpacing: `${textStyle.letterSpacing}px`,
						textDecoration: textDecorationCSS,
						textAlign: TEXT_ALIGN_CSS[
							textStyle.textAlign
						] as React.CSSProperties['textAlign'],
						wordWrap: 'break-word',
						whiteSpace: 'pre-wrap',
						overflowWrap: 'break-word'
					}}
				>
					{renderContent()}
				</div>
			</div>
		</foreignObject>
	)
}

// vim: ts=4
