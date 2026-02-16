// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * RichTextDisplay - renders rich text content in SVG via foreignObject.
 *
 * Observes Y.Text changes and re-renders. Each line is a div; each run
 * is a <span> with inline styles merged from Delta attributes + baseStyle.
 *
 * This is the sole display component for all text objects in canvas apps
 * (prezillo text boxes, ideallo text labels and sticky notes).
 */

import * as React from 'react'
import type * as Y from 'yjs'

import type { BaseTextStyle, ContainerStyle, DeltaOp, TextLine, TextRun } from '../types'
import { deltaToLines } from '../delta-parser'
import { resolveRunStyle, type ResolvedRunStyle } from '../measure'

export interface RichTextDisplayProps {
	x: number
	y: number
	width: number
	height: number
	yText: Y.Text
	baseStyle: BaseTextStyle
	containerStyle?: ContainerStyle
	/** CSS url(...) value for custom bullet icon, set as --bullet-icon CSS variable */
	bulletIconUrl?: string
	/** Allow clicking links (e.g., in presentation play mode) */
	linksClickable?: boolean
	/** Show as placeholder text (italic, gray) */
	isPlaceholder?: boolean
}

/**
 * Convert resolved run style to CSS properties
 */
function resolvedToCSS(resolved: ResolvedRunStyle): React.CSSProperties {
	const style: React.CSSProperties = {
		fontFamily: resolved.fontFamily,
		fontSize: `${resolved.fontSize}px`,
		fontWeight: resolved.fontWeight,
		fontStyle: resolved.fontItalic ? 'italic' : 'normal',
		color: resolved.color
	}

	const decorations: string[] = []
	if (resolved.underline) decorations.push('underline')
	if (resolved.strikethrough) decorations.push('line-through')
	if (decorations.length > 0) {
		style.textDecoration = decorations.join(' ')
	}

	if (resolved.letterSpacing && resolved.letterSpacing !== 0) {
		style.letterSpacing = `${resolved.letterSpacing}px`
	}

	return style
}

const VERTICAL_ALIGN_CSS: Record<string, string> = {
	top: 'flex-start',
	middle: 'center',
	bottom: 'flex-end'
}

const TEXT_ALIGN_CSS: Record<string, string> = {
	left: 'left',
	center: 'center',
	right: 'right',
	justify: 'justify'
}

export function RichTextDisplay({
	x,
	y,
	width,
	height,
	yText,
	baseStyle,
	containerStyle,
	bulletIconUrl,
	linksClickable = false,
	isPlaceholder = false
}: RichTextDisplayProps) {
	const [lines, setLines] = React.useState<TextLine[]>(() => {
		const delta = yText.toDelta() as DeltaOp[]
		return deltaToLines(delta)
	})

	// Observe Y.Text changes
	React.useEffect(() => {
		const handler = () => {
			const delta = yText.toDelta() as DeltaOp[]
			setLines(deltaToLines(delta))
		}

		yText.observe(handler)
		// Re-parse on mount in case yText changed between initial state and effect
		handler()

		return () => {
			yText.unobserve(handler)
		}
	}, [yText])

	const renderRun = (run: TextRun, index: number) => {
		const resolved = resolveRunStyle(run.style, baseStyle)
		if (isPlaceholder) {
			resolved.fontItalic = true
			resolved.color = '#999999'
		}
		const css = resolvedToCSS(resolved)

		if (run.style.link && linksClickable) {
			return (
				<a
					key={index}
					href={run.style.link}
					target="_blank"
					rel="noopener noreferrer"
					style={{
						...css,
						color: resolved.color,
						textDecoration: 'underline'
					}}
				>
					{run.text || '\u00A0'}
				</a>
			)
		}

		if (run.style.link) {
			// In non-clickable mode, still show link styling but no click
			return (
				<span
					key={index}
					style={{
						...css,
						textDecoration: 'underline',
						pointerEvents: 'none'
					}}
				>
					{run.text || '\u00A0'}
				</span>
			)
		}

		return (
			<span key={index} style={css}>
				{run.text || '\u00A0'}
			</span>
		)
	}

	const renderLine = (line: TextLine, index: number) => {
		const lineStyle: React.CSSProperties = {
			minHeight: `${baseStyle.fontSize * baseStyle.lineHeight}px`
		}

		// List rendering via CSS classes (styled in prezillo/style.css)
		if (line.listType === 'bullet') {
			return (
				<div key={index} className="rt-list-bullet" style={lineStyle}>
					{line.runs.map((run, i) => renderRun(run, i))}
				</div>
			)
		}

		if (line.listType === 'ordered' && line.listIndex !== undefined) {
			return (
				<div
					key={index}
					className="rt-list-ordered"
					style={lineStyle}
					data-index={line.listIndex}
				>
					{line.runs.map((run, i) => renderRun(run, i))}
				</div>
			)
		}

		return (
			<div key={index} style={lineStyle}>
				{line.runs.map((run, i) => renderRun(run, i))}
			</div>
		)
	}

	const containerCSS: React.CSSProperties = {
		width: '100%',
		height: '100%',
		display: 'flex',
		alignItems: VERTICAL_ALIGN_CSS[baseStyle.verticalAlign] || 'flex-start',
		overflow: 'visible',
		pointerEvents: 'none'
	}

	const innerCSS: Record<string, any> = {
		width: '100%',
		fontFamily: baseStyle.fontFamily,
		fontSize: `${baseStyle.fontSize}px`,
		fontWeight: baseStyle.fontWeight,
		fontStyle: baseStyle.fontItalic ? 'italic' : 'normal',
		color: isPlaceholder ? '#999999' : baseStyle.fill,
		lineHeight: baseStyle.lineHeight,
		letterSpacing: `${baseStyle.letterSpacing}px`,
		textAlign: TEXT_ALIGN_CSS[baseStyle.textAlign] as any,
		wordWrap: 'break-word',
		whiteSpace: 'pre-wrap',
		overflowWrap: 'break-word'
	}

	// Set custom bullet icon CSS variable if provided
	if (bulletIconUrl) {
		innerCSS['--bullet-icon'] = bulletIconUrl
	}

	// Apply container style overrides
	if (containerStyle) {
		if (containerStyle.background) innerCSS.background = containerStyle.background
		if (containerStyle.padding !== undefined) innerCSS.padding = `${containerStyle.padding}px`
		if (containerStyle.borderRadius !== undefined)
			innerCSS.borderRadius = `${containerStyle.borderRadius}px`
		if (containerStyle.color) innerCSS.color = containerStyle.color
	}

	return (
		<foreignObject x={x} y={y} width={width} height={height} style={{ overflow: 'visible' }}>
			<div style={containerCSS} className={containerStyle?.className}>
				<div style={innerCSS} className={bulletIconUrl ? 'custom-bullet' : undefined}>
					{lines.map((line, i) => renderLine(line, i))}
				</div>
			</div>
		</foreignObject>
	)
}

// vim: ts=4
