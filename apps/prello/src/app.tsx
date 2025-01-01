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

const APP_NAME = 'Prello'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import * as Y from 'yjs'
import { useY } from 'react-yjs'
import { SvgCanvas, useSvgCanvas, ToolEvent } from 'react-svg-canvas'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import './style.css'

import * as T from '@symbion/runtype'

import { useCloudilloEditor, mergeClasses } from '@cloudillo/react'

import {
	PiSelection as IcSelect,

	PiTextTBold as IcLabel,
	PiTextColumnsBold as IcText,
	PiRectangleBold as IcRect,

	PiTrashBold as IcDelete,
	PiArrowArcLeftBold as IcUndo,
	PiArrowArcRightBold as IcRedo
} from 'react-icons/pi'

import { ElementProps, ElementEditProps } from './types'
import * as Label from './elements/label'


interface TextObject {
	x: number
	y: number
	type: 'text'
	text: string
	width?: number
	height?: number
}

interface RectObject {
	x: number
	y: number
	type: 'rect'
	width: number
	height: number
}

type PrelloObject = Label.LabelElement | TextObject
	| RectObject

/////////////
// Toolbar //
/////////////
interface ToolbarProps {
	className?: string
	tool?: string
	setTool: (tool: string | undefined) => void
	activeId?: number
	onDelete?: (id: number) => void
	onUndo?: () => void
	onRedo?: () => void
}

function Toolbar({ className, tool, setTool, activeId, onDelete, onUndo, onRedo }: ToolbarProps) {
	return <div className={mergeClasses('c-nav c-hbox p-1 mb-1', className)}>
		<button onClick={() => setTool(undefined)} className={mergeClasses('c-button icon', tool == undefined ? 'active' : '')}>
			<IcSelect/>
		</button>

		<button onClick={() => setTool('label')} className={mergeClasses('c-button icon ms-1', tool == 'label' ? 'active' : '')}>
			<IcLabel/>
		</button>
		<button onClick={() => setTool('text')} className={mergeClasses('c-button icon ms-1', tool == 'text' ? 'active' : '')}>
			<IcText/>
		</button>
		<button onClick={() => setTool('rect')} className={mergeClasses('c-button icon', tool == 'rect' ? 'active' : '')}>
			<IcRect/>
		</button>

			<button onClick={onUndo} className="c-button icon ms-1" disabled={!onUndo}><IcUndo/></button>
			<button onClick={onRedo} className="c-button icon" disabled={!onRedo}><IcRedo/></button>

		{ activeId != undefined && <>
			<button onClick={() => onDelete?.(activeId)} className="c-button icon ms-1"><IcDelete/></button>
		</> }
	</div>
}

// Text
function Text({ element, onClick }: ElementProps<TextObject>) {
	const ref = React.useRef<SVGTextElement>(null)
	const [scale, setScale] = React.useState(1)
	//console.log('Text render', element.text, scale, ref.current, ref.current?.getBBox(), ref.current?.getComputedTextLength())

	React.useEffect(function () {
		const bbox = ref.current?.getBBox()
		if (!bbox) return

		//console.log('bbox', ref.current, bbox, ref.current?.getComputedTextLength())
		if (element.width && !element.height) {
			setScale(element.width / bbox.width)
		}
	}, [element.width, element.height])

	return <text ref={ref} x={element.x} y={element.y} fill='#ffff88' fontSize={`${scale}rem`} onClick={onClick}>{element.text}</text>
}

function EditText({ element, setElement, onClick }: ElementEditProps<TextObject>) {
	const divRef = React.useRef<HTMLDivElement>(null)
	const svgRef = React.useRef<SVGForeignObjectElement>(null)
	const [scale, setScale] = React.useState(1)
	const [height, setHeight] = React.useState<number | undefined>()
	console.log('Text render', element.text, scale, divRef.current, divRef.current?.clientWidth)

	function onResize(x: number, y: number, width: number, height: number) {
		console.log('onResize', x, y, width, height)
		setElement({ ...element, x, y, width, height })
	}

	React.useEffect(function () {
		setHeight(divRef.current?.clientHeight)
		const width = divRef.current?.clientWidth

		console.log('bbox', divRef.current, width)
		if (width && element.width && !element.height) {
			setScale(element.width / width)
		}
	}, [])

	return <>
		<foreignObject ref={svgRef as any} x={element.x || 0} y={(element.y || 0) - (height || 0)} width={element.width || 1000} height={element.height || 1000} onClick={onClick}>
			<div ref={divRef} style={{ fontSize: `${scale}rem` }}>{element.text}</div>
		</foreignObject>
		{/*
		<EditGadget svgRef={svgRef} onResize={onResize}/>
		*/}
	</>
}

// Rect
function Rect({ element, onClick }: ElementProps<RectObject>) {
	return <rect x={element.x} y={element.y} width={element.width} height={element.height} stroke='black' fill='#008800' onClick={onClick}/>
}

function EditRect({ element, setElement, onClick }: ElementEditProps<RectObject>) {
	const svgRef = React.useRef<SVGTextElement>(null)
	const [scale, setScale] = React.useState(1)

	function onResize(x: number, y: number, width: number, height: number) {
		console.log('onResize', x, y, width, height)
		setElement({ ...element, x, y, width, height })
	}

	React.useEffect(function () {
		if (!svgRef.current) return

		const bbox = svgRef.current?.getBBox()

		console.log('bbox', bbox)
		if (element.width) setScale(element.width / bbox.width)
	}, [])

	return <>
		return <rect x={element.x} y={element.y} width={element.width} height={element.height} stroke='black' fill='#008800' onClick={onClick}/>
	</>
		//{ svgRef?.current && <EditGadget svgRef={svgRef.current} onResize={onResize}/> }
}

// PrelloObject
function PrelloObject({ element, onClick }: ElementProps<PrelloObject>) {
	switch (element.type) {
		case 'text': return <Text element={element} onClick={onClick}/>
		case 'label': return <Label.Label element={element} onClick={onClick}/>
		case 'rect': return <Rect element={element} onClick={onClick}/>
	}
}

function EditPrelloObject({ element, setElement, onClick }: ElementEditProps<PrelloObject>) {
	switch (element.type) {
		//case 'text': return <EditText element={element} setElement={setElement} onClick={onClick}/>
		case 'label': return <Label.EditLabel element={element} setElement={setElement as any} onClick={onClick}/>
		//case 'rect': return <EditRect element={element} setElement={setElement} onClick={onClick}/>
	}
}

export function PrelloApp() {
	const { t } = useTranslation()
	const cloudillo = useCloudilloEditor(APP_NAME)
	//const [objs, setObjs] = React.useState<Y.Array<PrelloObject> | undefined>(undefined)
	//const [yObjs, setYObjs] = React.useState(cloudillo.yDoc.getArray<PrelloObject>('doc'))
	const yObjs = React.useMemo(() => cloudillo.yDoc.getArray<PrelloObject>('doc'), [cloudillo.yDoc])
	const objs = useY(yObjs)
	const [undoManager, setUndoManager] = React.useState<Y.UndoManager | undefined>()
	const [tool, setTool] = React.useState<string | undefined>()
	const [toolEvent, setToolEvent] = React.useState<ToolEvent | undefined>()
	const [activeId, setActiveId] = React.useState<number | undefined>()

	function onObjectClick(evt: React.MouseEvent<SVGGraphicsElement>, id: number) {
		console.log('onObjectClick', evt, id)
		setActiveId(id)
	}

	function setElement(id: number, element: PrelloObject) {
		if (cloudillo.yDoc && yObjs) {
			cloudillo.yDoc.transact(() => {
				yObjs.insert(id, [element])
				yObjs.delete(id + 1)
			})
		}
	}

	function deleteObj(id: number) {
		if (yObjs) {
			yObjs.delete(id)
			setActiveId(undefined)
		}
	}

	function undo() {
		setActiveId(undefined)
		undoManager?.undo()
	}

	function redo() {
		setActiveId(undefined)
		undoManager?.redo()
	}

	function onToolStart(evt: ToolEvent) {
		console.log('onToolStart', evt)
		setToolEvent(evt)
	}

	function onToolMove(evt: ToolEvent) {
		setToolEvent(evt)
	}

	function onToolEnd() {
		console.log('onToolEnd')
		if (!toolEvent) return

		let element: PrelloObject | undefined
		switch (tool) {
		case 'rect':
			element = {
				type: 'rect',
				x: Math.min(toolEvent.startX, toolEvent.x),
				y: Math.min(toolEvent.startY, toolEvent.y),
				width: Math.abs(toolEvent.startX - toolEvent.x),
				height: Math.abs(toolEvent.startY - toolEvent.y)
			}
			break
		case 'label':
			element = {
				type: 'label',
				x: Math.min(toolEvent.startX, toolEvent.x),
				y: Math.min(toolEvent.startY, toolEvent.y),
				width: Math.abs(toolEvent.startX - toolEvent.x),
				height: Math.abs(toolEvent.startY - toolEvent.y),
				text: 'Text'
			}
			break
		}
		if (element) yObjs?.push([element])
		setTool(undefined)
		setToolEvent(undefined)
	}

	function onKeyDown(evt: React.KeyboardEvent) {
		console.log('keyDown', evt.key)
		if (!evt.altKey && !evt.shiftKey && !evt.ctrlKey) {
			switch (evt.key) {
			case 'Delete':
				if (activeId) deleteObj(activeId)
				break
			}
		} else if (!evt.altKey && !evt.shiftKey && evt.ctrlKey) {
			switch (evt.key) {
			case 'z':
				undo()
				break
			case 'y':
				redo()
				break
			}
		}
	}

	React.useEffect(function () {
		console.log('PrelloApp', cloudillo)

		if (cloudillo.yDoc && cloudillo.provider) {
			cloudillo.provider.awareness.setLocalStateField('user', {
				name: cloudillo.idTag,
				color: cloudillo.idTag == 'cloud.w9.hu' ? '#000088' : '#008800'
			})
			//const docData: Y.Array<PrelloObject> = cloudillo.yDoc.getArray('doc')
			const undoManager = new Y.UndoManager(yObjs)
			setUndoManager(undoManager)
			/*
			docData.observeDeep(evt => {
				console.log('Observe', evt, docData.toJSON())
				setYObjs(docData)
				setObjs(docData.toJSON())
			})
			*/
		}
	}, [cloudillo.provider])

	return <>
		<Toolbar
			tool={tool}
		setTool={t => (setActiveId(undefined), setTool(t !== tool ? t : undefined))}
		activeId={activeId} onDelete={id => deleteObj(id)}
		onUndo={!!undoManager?.undoStack.length ? undo : undefined}
		onRedo={!!undoManager?.redoStack.length ? redo : undefined}/>
		<div className="c-panel flex-fill" onKeyDown={onKeyDown}>
			<SvgCanvas
				className="w-100 h-100"
				onToolStart={tool ? onToolStart : undefined}
				onToolMove={tool ? onToolMove : undefined}
				onToolEnd={tool ? onToolEnd : undefined}
				fixed={activeId != undefined && objs?.[activeId] && objs[activeId].type == 'label' && <Label.EditLabelGadget element={objs[activeId]} setElement={el => setElement(activeId, el)}/>}
			>
				{/*
				<rect x={0} y={0} width={100} height={100} fill="green" onClick={evt => onObjectClick(evt, -1)}/>
				<foreignObject x={20} y={120} width={100} height={100}>
					<p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
				</foreignObject>
				<Text element={{ x: 1000, y: 200, type: 'text', text: 'Ciao!'}} onClick={evt => onObjectClick(evt, -2)}/>
				*/}
				{ !!objs && objs.map((element, idx) => idx != activeId && <PrelloObject key={idx} element={element} onClick={evt => onObjectClick(evt, idx)}/>) }
				{ !!toolEvent && <rect
					x={Math.min(toolEvent.startX, toolEvent.x)}
					y={Math.min(toolEvent.startY, toolEvent.y)}
					width={Math.abs(toolEvent.x - toolEvent.startX)}
					height={Math.abs(toolEvent.y - toolEvent.startY)}
					stroke="blue"
					fill="none"
				/> }
				{ activeId != undefined && objs?.[activeId] && <>
					<EditPrelloObject element={objs[activeId]} setElement={el => setElement(activeId, el)}/>
				</> }
			</SvgCanvas>
		</div>
	</>
}

// vim: ts=4
