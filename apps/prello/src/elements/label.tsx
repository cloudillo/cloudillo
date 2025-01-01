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

const DEBUG = 0

import * as React from 'react'

import { PrelloElement, ElementProps, ElementEditProps } from '../types'
import { useSvgCanvas } from 'react-svg-canvas'
import { EditGadget } from '../edit-gadget'

export interface LabelElement extends PrelloElement {
	x: number
	y: number
	type: 'label'
	text: string
	width: number
	height: number
}

function shiftY(y: number, fontSize: number) {
	return y + fontSize * 16 / 1.15
}

export function Label({ element, onClick }: ElementProps<LabelElement>) {
	const ref = React.useRef<SVGTextElement>(null)
	const [scale, setScale] = React.useState<number | undefined>()

	React.useEffect(function () {
		const bbox = ref.current?.getBBox()
		if (!bbox) return

		if (element.width) {
			setScale(element.width / bbox.width)
		}
	}, [ref, element.width, element.height])

	return <text ref={ref} x={element.x} y={shiftY(element.y, scale || 1)} fill='#ffff88' fontSize={`${scale || 1}rem`} onClick={onClick} style={scale ? undefined : { opacity: 0 }}>{element.text}</text>
}

export function EditLabel({ element, setElement, onClick }: ElementEditProps<LabelElement>) {
	const canvas = useSvgCanvas()
	const ref = React.useRef<SVGTextElement>(null)
	const inputRef = React.useRef<HTMLInputElement>(null)
	const [scale, setScale] = React.useState<number | undefined>()
	const [text, setText] = React.useState<string | undefined>()
	const [cursor, setCursor] = React.useState<[number , number] | undefined>()
	const len = ref.current?.getNumberOfChars() || 0
	const cursorPos = ref.current && cursor && text !== undefined
		? [
			(cursor[0] < len ? ref.current.getStartPositionOfChar(cursor[0])! : ref.current.getEndPositionOfChar(len - 1)!),
			(cursor[1] < len ? ref.current.getStartPositionOfChar(cursor[1])! : ref.current.getEndPositionOfChar(len - 1)!)
		] : undefined

	function onResize(x: number, y: number, width: number, height: number) {
		console.log('onResize', x, y, width, height)
		setElement({ ...element, x, y, width, height })
	}

	function onClickText(evt: React.MouseEvent<SVGTextElement>) {
		evt.stopPropagation()
		setText(element.text)
		const point = canvas.svg!.createSVGPoint();
		[point.x, point.y] = canvas.translateTo(evt.clientX, evt.clientY)
		point.y = element.y
		const curs = Math.max(ref.current?.getCharNumAtPosition(point) || 0, 0)
		console.log('curs', point, curs, ref.current?.getNumberOfChars())
		setCursor([curs, curs])
		inputRef.current?.focus()
		setTimeout(() => inputRef.current?.setSelectionRange(curs, curs), 0)
	}

	function onChange(evt: React.ChangeEvent<HTMLInputElement>) {
		setText(evt.target.value)
	}

	function onFocus() {
		if (text == undefined) {
			setText(element.text)
			setTimeout(() => inputRef.current?.setSelectionRange(0, inputRef.current.value.length), 0)
		}
	}

	function onBlur() {
		console.log('onBlur', text)
		if (text != undefined && text != element.text) setElement({ ...element, text })
		setText(undefined)
		setCursor(undefined)
	}

	function onKeyDown(evt: React.KeyboardEvent<HTMLInputElement>) {
		console.log('keyPress', evt.key, inputRef.current?.selectionStart, inputRef.current?.selectionEnd)
		switch (evt.key) {
			case 'Escape':
				setText(element.text)
				break
			case 'Enter':
				inputRef.current?.blur()
				break
		}
	}

	React.useEffect(function () {
		console.log('effect', text, !!ref.current, element.width)
		if (!ref.current) return

		const bbox = ref.current?.getBBox()

		if (element.width) {
			const newScale = element.width / bbox.width * (scale || 1)
			console.log('scale', scale, newScale)
			setScale(scale => element.width / bbox.width * (scale || 1))
		}

	}, [text || element.text, ref.current, element.width])

	/* HACK for missing selection event */
	React.useEffect(function () {
		const interval = setInterval(function pollSelection() {
			if (inputRef.current?.selectionStart !== cursor?.[0] || inputRef.current?.selectionEnd !== cursor?.[1]) {
				console.log('selectionchange', inputRef.current?.selectionStart, inputRef.current?.selectionEnd)
				setCursor([inputRef.current?.selectionStart || 0, inputRef.current?.selectionEnd || 0])
			}
		}, 100)

		return () => clearInterval(interval)
	}, [inputRef.current, cursor, setCursor])

	return <>
		{ !!cursorPos && <>
			<rect
				x={cursorPos[0].x}
				y={cursorPos[0].y - (scale || 1) * 17}
				//y={shiftY(cursorPos[0].y, scale || 1)}
				width={Math.max(cursorPos[1].x - cursorPos[0].x, 3)}
				height={(scale || 1) * 16 * 1.15}
				stroke='none'
				fill='#88f'
			/>
				{/*
				<foreignObject style={{ display: 'none' }}>
				*/}
		</> }
		<text
			ref={ref}
			x={element.x}
			y={shiftY(element.y, scale || 1)}
			fill='#ffff88'
			fontSize={`${scale}rem`}
			style={{ lineHeight: '100%' }}
			onClick={onClickText}
		>
			{text === undefined ? element.text : text}
		</text>
		<foreignObject x={element.x} y={element.y} width={300} height={DEBUG ? 30 : 0}>
			<input
				ref={inputRef}
				autoFocus
				value={text || ''}
				onChange={onChange}
				onKeyDown={onKeyDown}
				onFocus={onFocus}
				onBlur={onBlur}
				style={{ color: '#000', opacity: DEBUG ? 1 : 1 }}
			/>
		</foreignObject>
	</>
}

export function EditLabelGadget({ element, setElement, onClick }: ElementEditProps<LabelElement>) {
	function onMove(dx: number, dy: number) {
		console.log('move', element, { ...element, x: element.x + dx, y: element.y + dy })
		//setElement(el => ({ ...el, x: el.x + dx, y: el.y + dy }))
		setElement({ ...element, x: element.x + dx, y: element.y + dy })
	}
	function onResize(x: number, y: number, width: number, height: number) {
		//setElement(el => ({ ...el, x, y, width, height }))
	}

	function onResizeX(x: number, width: number) {
		//setElement(el => ({ ...el, x, width }))
	}

	function onResizeY(y: number, height: number) {
		//setElement(el => ({ ...el, y, height }))
	}

	return <EditGadget state={{ bbox: { x: element.x, y: element.y, width: element.width, height: element.height }} } onMove={onMove} onResize={onResize} onResizeX={onResizeX} onResizeY={onResizeY}/>
}

// vim: ts=4
