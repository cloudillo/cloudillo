// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Sizing knobs for an embedded view in a flow host: mode and scale for fixed views, width,
 * max height and text size for reflowing views (which only ever fit the width).
 */

import type { EmbedSizing, EmbedViewKind } from '@cloudillo/core'
import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { Button } from '../Button/index.js'
import { NumberInput } from '../NumberInput/index.js'
import { Segmented, SegmentedItem } from '../Segmented/index.js'
import type { EmbedViewSettings } from './sizing.js'

export interface EmbedSizingControlsProps {
	kind: EmbedViewKind
	settings: EmbedViewSettings
	onChange: (settings: EmbedViewSettings) => void
}

const SCALE_PRESETS = [50, 75, 100, 150]

export function EmbedSizingControls({ kind, settings, onChange }: EmbedSizingControlsProps) {
	const { t } = useLibTranslation()
	const scale = Math.round((settings.scale ?? 1) * 100)
	const setScale = (pct: number) =>
		onChange({ ...settings, scale: Math.min(400, Math.max(25, pct)) / 100 })

	return (
		<div className="cl-embed-sizing">
			{kind === 'fixed' && (
				<Segmented
					fill
					size="sm"
					aria-label={t('Embed size')}
					value={settings.sizing}
					onChange={(sizing) => onChange({ ...settings, sizing: sizing as EmbedSizing })}
				>
					{/* Never upscales: `computeEmbedFrame` caps the scale at 1 */}
					<SegmentedItem value="fit-width">{t('Shrink to fit')}</SegmentedItem>
					<SegmentedItem value="actual">{t('Actual size')}</SegmentedItem>
				</Segmented>
			)}
			{kind === 'fixed' && settings.sizing === 'actual' && (
				<>
					<label className="cl-embed-sizing-row">
						<span>{t('Scale')}</span>
						<NumberInput
							value={scale}
							min={25}
							max={400}
							step={5}
							suffix="%"
							onChange={setScale}
						/>
					</label>
					<div className="cl-embed-sizing-row">
						{SCALE_PRESETS.map((pct) => (
							<Button
								key={pct}
								size="sm"
								variant="ghost"
								pressed={scale === pct}
								onClick={() => setScale(pct)}
							>
								{pct}%
							</Button>
						))}
					</div>
				</>
			)}
			{kind === 'reflow' && (
				<label className="cl-embed-sizing-row">
					<span>{t('Width')}</span>
					<NumberInput
						value={settings.width ?? 100}
						min={10}
						max={100}
						step={5}
						suffix="%"
						onChange={(pct) =>
							onChange({ ...settings, width: Math.min(100, Math.max(10, pct)) })
						}
					/>
				</label>
			)}
			{kind === 'reflow' && (
				<label className="cl-embed-sizing-row">
					<span>{t('Max height')}</span>
					<NumberInput
						value={settings.maxH ?? 0}
						min={0}
						step={50}
						suffix="px"
						placeholder={t('None')}
						onChange={(maxH) => onChange({ ...settings, maxH: maxH || undefined })}
					/>
				</label>
			)}
			{kind === 'reflow' && (
				<label className="cl-embed-sizing-row">
					<span>{t('Text size')}</span>
					<NumberInput
						value={Math.round((settings.textScale ?? 1) * 100)}
						min={90}
						max={150}
						step={10}
						suffix="%"
						onChange={(pct) =>
							onChange({
								...settings,
								textScale: Math.min(150, Math.max(90, pct)) / 100
							})
						}
					/>
				</label>
			)}
		</div>
	)
}

// vim: ts=4
