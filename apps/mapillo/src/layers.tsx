// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { IcCheck, IcClose } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcLayers } from './icons.js'
import type { TileLayerConfig, TileLayerId } from './types.js'

interface LayerPanelProps {
	layers: TileLayerConfig[]
	activeTileId: TileLayerId
	onSelect: (id: TileLayerId) => void
	open: boolean
	onToggle: (open: boolean) => void
}

export function LayerPanel({ layers, activeTileId, onSelect, open, onToggle }: LayerPanelProps) {
	const { t } = useTranslation()
	if (!open) {
		return (
			<button
				className="mapillo-ctrl mapillo-layer-toggle"
				onClick={() => onToggle(true)}
				title={t('Change map style')}
			>
				<IcLayers />
			</button>
		)
	}

	return (
		<div className="mapillo-layer-panel">
			<div className="mapillo-layer-header">
				<span>{t('Map Style')}</span>
				<button onClick={() => onToggle(false)} title={t('Close')}>
					<IcClose />
				</button>
			</div>
			<div className="mapillo-layer-list">
				{layers.map((layer) => {
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
								{layer.description && (
									<div className="mapillo-layer-desc">{t(layer.description)}</div>
								)}
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
