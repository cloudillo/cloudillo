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

const CONTROLLER_SIZE = 8

import * as React from 'react'
import { SvgCanvas, useSvgCanvas, ToolEvent } from 'react-svg-canvas'

export interface EditGadgetProps {
	state: { bbox: { x: number, y: number, width: number, height: number }}
	onMove?: (x: number, y: number) => void
	onResize?: (x: number, y: number, width: number, height: number) => void
	onResizeX?: (x: number, width: number) => void
	onResizeY?: (y: number, height: number) => void
}

export function EditGadget({state: { bbox }, onMove, onResize, onResizeX, onResizeY }: EditGadgetProps) {
	const svgCanvas = useSvgCanvas()
	const translatedBbox = React.useMemo(() => {
		if (!bbox) return undefined
		const [x, y] = svgCanvas.translateFrom(bbox.x, bbox.y)
		const [width, height] = [svgCanvas.scale * bbox.width, svgCanvas.scale * bbox.height]

		return { x, y, width, height }
	}, [bbox?.x, bbox?.y, bbox?.width, bbox?.height, svgCanvas.matrix])

	function onMoveClick(evt: React.MouseEvent<SVGRectElement>) {
		evt.preventDefault()
		const [startX, startY] = svgCanvas.translateTo(evt.clientX, evt.clientY)

		svgCanvas.setDragHandler({
			onDragMove: function (evt: ToolEvent) {
				console.log('onDragMove', )
				onMove?.(evt.x - startX, evt.y - startY)
			},
			onDragEnd: function () {
				console.log('onDragEnd')
			}
		})
		svgCanvas.startDrag(evt)
	}

	if (!translatedBbox) return null

	return <>
		{/*
		<rect x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height} stroke="blue" fill="none"/>
		*/}
		<rect x={translatedBbox.x} y={translatedBbox.y} width={translatedBbox.width} height={translatedBbox.height} stroke="#fff" fill="none" strokeDasharray={5}/>
		{ !!onResize && <>
			<rect x={translatedBbox.x - CONTROLLER_SIZE / 2} y={translatedBbox.y - CONTROLLER_SIZE / 2} width={CONTROLLER_SIZE} height={CONTROLLER_SIZE} stroke="red" fill="yellow"/>
			<rect x={translatedBbox.x + translatedBbox.width - CONTROLLER_SIZE / 2} y={translatedBbox.y - CONTROLLER_SIZE / 2} width={CONTROLLER_SIZE} height={CONTROLLER_SIZE} stroke="red" fill="yellow" onClick={() => onResizeX?.(translatedBbox.x, translatedBbox.width)}/>
			<rect x={translatedBbox.x + translatedBbox.width - CONTROLLER_SIZE / 2} y={translatedBbox.y + translatedBbox.height - CONTROLLER_SIZE / 2} width={CONTROLLER_SIZE} height={CONTROLLER_SIZE} stroke="red" fill="yellow" onClick={() => onResizeX?.(translatedBbox.x, translatedBbox.width)}/>
			<rect x={translatedBbox.x - CONTROLLER_SIZE / 2} y={translatedBbox.y + translatedBbox.height - CONTROLLER_SIZE / 2} width={CONTROLLER_SIZE} height={CONTROLLER_SIZE} stroke="red" fill="yellow" onClick={() => onResizeX?.(translatedBbox.x, translatedBbox.width)}/>
			<rect x={translatedBbox.x + translatedBbox.width / 2 - CONTROLLER_SIZE / 2} y={translatedBbox.y + translatedBbox.height / 2 - CONTROLLER_SIZE / 2} width={CONTROLLER_SIZE} height={CONTROLLER_SIZE} stroke="red" fill="#ffff00" onMouseDown={onMoveClick}/>
		</> }
	</>
}

// vim: ts=4
