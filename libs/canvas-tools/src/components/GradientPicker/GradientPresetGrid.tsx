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

import * as React from 'react'
import { mergeClasses, createComponent } from '@cloudillo/react'
import type { GradientPreset, GradientPresetCategory, Gradient } from '../../types/gradient.js'
import { GRADIENT_PRESETS, getPresetsByCategory } from '../../presets/gradients.js'
import { gradientToCSS } from '../../utils/gradient.js'

export interface GradientPresetGridProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
	/** Filter by category (optional) */
	category?: GradientPresetCategory
	/** Called when a preset is selected */
	onSelect: (gradient: Gradient) => void
	/** Currently selected preset ID (optional) */
	selectedId?: string
	/** Number of columns (default 4, 3 on mobile via CSS) */
	columns?: number
	/** Maximum number of presets to show */
	maxItems?: number
}

/**
 * Grid of gradient preset swatches for quick selection.
 */
export const GradientPresetGrid = createComponent<HTMLDivElement, GradientPresetGridProps>(
	'GradientPresetGrid',
	(
		{ className, category, onSelect, selectedId, columns = 4, maxItems, style, ...props },
		ref
	) => {
		const presets = React.useMemo(() => {
			const filtered = category ? getPresetsByCategory(category) : GRADIENT_PRESETS
			return maxItems ? filtered.slice(0, maxItems) : filtered
		}, [category, maxItems])

		const handlePresetClick = React.useCallback(
			(preset: GradientPreset) => {
				onSelect(preset.gradient)
			},
			[onSelect]
		)

		return (
			<div
				ref={ref}
				className={mergeClasses('c-gradient-preset-grid', className)}
				style={{
					...style,
					gridTemplateColumns: `repeat(${columns}, 1fr)`
				}}
				role="listbox"
				aria-label="Gradient presets"
				{...props}
			>
				{presets.map((preset) => (
					<button
						key={preset.id}
						type="button"
						className={mergeClasses(
							'c-gradient-preset-item',
							selectedId === preset.id && 'selected'
						)}
						style={{ background: gradientToCSS(preset.gradient) }}
						onClick={() => handlePresetClick(preset)}
						role="option"
						aria-selected={selectedId === preset.id}
						aria-label={preset.name}
						title={preset.name}
					/>
				))}
			</div>
		)
	}
)

// vim: ts=4
