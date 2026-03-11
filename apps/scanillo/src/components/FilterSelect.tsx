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
import {
	PiCheckBold as IcCheck,
	PiArrowLeftBold as IcBack,
	PiArrowCounterClockwiseBold as IcRotateLeft,
	PiArrowClockwiseBold as IcRotateRight
} from 'react-icons/pi'

import { ZoomableImage } from '@cloudillo/react'

import { type PageFilter, FILTER_DEFAULTS } from '../types.js'
import { applyFilter, rotateCanvas, blendWithOriginal } from '../utils/image-processing.js'

interface FilterSelectProps {
	sourceCanvas: HTMLCanvasElement
	initialRotation?: number
	onConfirm: (
		canvas: HTMLCanvasElement,
		filter: PageFilter,
		rotation: number,
		strength: number
	) => Promise<void>
	onBack: () => void
}

const FILTERS: { id: PageFilter; label: string }[] = [
	{ id: 'original', label: 'Original' },
	{ id: 'document', label: 'Document' },
	{ id: 'docbw', label: 'Doc B/W' },
	{ id: 'bw', label: 'B&W' },
	{ id: 'highcontrast', label: 'High contrast' }
]

export function FilterSelect({
	sourceCanvas,
	initialRotation,
	onConfirm,
	onBack
}: FilterSelectProps) {
	const [selectedFilter, setSelectedFilter] = React.useState<PageFilter>('document')
	const [processing, setProcessing] = React.useState(false)
	const [rotation, setRotation] = React.useState(initialRotation ?? 0)
	const [strength, setStrength] = React.useState(FILTER_DEFAULTS.document)
	const filteredCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
	const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({})

	const rotatedCanvas = React.useMemo(
		() => (rotation === 0 ? sourceCanvas : rotateCanvas(sourceCanvas, rotation)),
		[sourceCanvas, rotation]
	)

	// Generate thumbnails from rotated source (updates when rotation changes)
	React.useEffect(() => {
		let cancelled = false

		async function generateThumbnails() {
			const thumbW = 120
			const scale = thumbW / rotatedCanvas.width
			const thumbH = Math.round(rotatedCanvas.height * scale)

			const thumbSource = document.createElement('canvas')
			thumbSource.width = thumbW
			thumbSource.height = thumbH
			const ctx = thumbSource.getContext('2d')!
			ctx.drawImage(rotatedCanvas, 0, 0, thumbW, thumbH)

			for (const f of FILTERS) {
				if (cancelled) return
				const filtered = await applyFilter(thumbSource, f.id)
				const dataUrl = filtered.toDataURL('image/jpeg', 0.7)
				if (!cancelled) {
					setThumbnails((prev) => ({ ...prev, [f.id]: dataUrl }))
				}
			}
		}

		setThumbnails({})
		generateThumbnails()
		return () => {
			cancelled = true
		}
	}, [rotatedCanvas])

	// Apply filter at full intensity and cache, then blend for preview
	const [previewUrl, setPreviewUrl] = React.useState('')
	const [applyingFilter, setApplyingFilter] = React.useState(false)
	React.useEffect(() => {
		let cancelled = false
		setApplyingFilter(true)
		applyFilter(rotatedCanvas, selectedFilter)
			.then((filtered) => {
				if (cancelled) return
				filteredCanvasRef.current = filtered
				if (selectedFilter === 'original' || strength === 100) {
					setPreviewUrl(filtered.toDataURL('image/jpeg', 0.85))
				} else {
					const blended = blendWithOriginal(rotatedCanvas, filtered, strength / 100)
					setPreviewUrl(blended.toDataURL('image/jpeg', 0.85))
				}
				setApplyingFilter(false)
			})
			.catch((err) => {
				if (cancelled) return
				console.error('[FilterSelect] Filter error:', err)
				setApplyingFilter(false)
			})
		return () => {
			cancelled = true
		}
	}, [rotatedCanvas, selectedFilter])

	function handleStrengthChange(newStrength: number) {
		setStrength(newStrength)
		const filtered = filteredCanvasRef.current
		if (!filtered) return
		if (newStrength === 100) {
			setPreviewUrl(filtered.toDataURL('image/jpeg', 0.85))
		} else {
			const blended = blendWithOriginal(rotatedCanvas, filtered, newStrength / 100)
			setPreviewUrl(blended.toDataURL('image/jpeg', 0.85))
		}
	}

	function handleFilterSwitch(filter: PageFilter) {
		setSelectedFilter(filter)
		setStrength(FILTER_DEFAULTS[filter])
		setPreviewUrl('')
	}

	const handleRotateLeft = () => setRotation((r) => (r + 270) % 360)
	const handleRotateRight = () => setRotation((r) => (r + 90) % 360)

	async function handleConfirm() {
		setProcessing(true)
		try {
			const filtered = await applyFilter(rotatedCanvas, selectedFilter)
			let result: HTMLCanvasElement
			if (selectedFilter === 'original' || strength === 100) {
				result = filtered
			} else {
				result = blendWithOriginal(rotatedCanvas, filtered, strength / 100)
			}
			await onConfirm(result, selectedFilter, rotation, strength)
		} catch (err) {
			console.error('[FilterSelect] Processing error:', err)
		} finally {
			setProcessing(false)
		}
	}

	const filterDefault = FILTER_DEFAULTS[selectedFilter]

	return (
		<div className="filter-select">
			<div className="filter-preview">
				{previewUrl ? (
					<>
						<ZoomableImage src={previewUrl} alt="Preview" resetOnSrcChange={false} />
						{applyingFilter && (
							<div className="filter-preview-spinner">
								<div className="c-spinner" />
							</div>
						)}
					</>
				) : (
					<div className="filter-preview-loading">
						<div className="c-spinner" />
						<small>Applying filter...</small>
					</div>
				)}
			</div>
			{selectedFilter !== 'original' && (
				<div className="filter-strength">
					<div className="filter-strength-track">
						<input
							type="range"
							min={0}
							max={100}
							value={strength}
							onChange={(e) => handleStrengthChange(Number(e.target.value))}
						/>
						<span
							className="filter-strength-default"
							style={{ left: `${filterDefault}%` }}
						/>
					</div>
				</div>
			)}
			<div className="filter-strip">
				{FILTERS.map((f) => (
					<button
						key={f.id}
						className={`filter-thumb ${selectedFilter === f.id ? 'active' : ''}`}
						onClick={() => handleFilterSwitch(f.id)}
					>
						{thumbnails[f.id] ? (
							<img src={thumbnails[f.id]} alt={f.label} />
						) : (
							<div className="filter-thumb-skeleton" />
						)}
						<span>{f.label}</span>
					</button>
				))}
			</div>
			<div className="filter-toolbar">
				<button className="c-button icon" onClick={onBack} title="Back">
					<IcBack />
				</button>
				<button className="c-button icon" onClick={handleRotateLeft} title="Rotate left">
					<IcRotateLeft />
				</button>
				<button className="c-button icon" onClick={handleRotateRight} title="Rotate right">
					<IcRotateRight />
				</button>
				<button
					className="c-button primary"
					onClick={handleConfirm}
					disabled={processing}
					title="Apply filter"
				>
					{processing ? <div className="c-spinner small" /> : <IcCheck />}
				</button>
			</div>
		</div>
	)
}

// vim: ts=4
