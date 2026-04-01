// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuLayers as IcLayers, LuX as IcClose, LuCheck as IcCheck } from 'react-icons/lu'

import type { TileLayerId } from './types.js'
import { TILE_LAYERS } from './styles.js'

interface LayerPanelProps {
	activeTileId: TileLayerId
	onSelect: (id: TileLayerId) => void
	open: boolean
	onToggle: (open: boolean) => void
}

export function LayerPanel({ activeTileId, onSelect, open, onToggle }: LayerPanelProps) {
	if (!open) {
		return (
			<button
				className="mapillo-layer-toggle"
				onClick={() => onToggle(true)}
				title="Change map style"
			>
				<IcLayers />
			</button>
		)
	}

	return (
		<div className="mapillo-layer-panel">
			<div className="mapillo-layer-header">
				<span>Map Style</span>
				<button onClick={() => onToggle(false)} title="Close">
					<IcClose />
				</button>
			</div>
			<div className="mapillo-layer-list">
				{TILE_LAYERS.map((layer) => {
					const isActive = layer.id === activeTileId
					return (
						<button
							key={layer.id}
							className={`mapillo-layer-card ${isActive ? 'active' : ''}`}
							onClick={() => {
								onSelect(layer.id)
								onToggle(false)
							}}
						>
							<div
								className="mapillo-layer-swatch"
								style={{ background: layer.previewColor }}
							/>
							<div className="mapillo-layer-info">
								<div className="mapillo-layer-name">{layer.name}</div>
								<div className="mapillo-layer-desc">{layer.description}</div>
							</div>
							{isActive && <IcCheck className="mapillo-layer-check" />}
						</button>
					)
				})}
			</div>
		</div>
	)
}

// vim: ts=4
