// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilard Hajba
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
