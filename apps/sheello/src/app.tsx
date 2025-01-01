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

const APP_NAME = 'Sheello'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Cell, CellWithRowAndCol, Op } from '@fortune-sheet/core'
import { Workbook, WorkbookInstance } from '@fortune-sheet/react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@fortune-sheet/react/dist/index.css'
import './style.css'

import * as T from '@symbion/runtype'

import { useCloudilloEditor, mergeClasses } from '@cloudillo/react'

import {
} from 'react-icons/lu'

//type YCell = Y.Map<Cell>
type YCell = Cell
type YRow = Y.Array<YCell | false>
type YSheet = Y.Array<YRow | false>
type YWorkbook = Y.Map<YSheet>

function compareCell(a: Cell, b: Cell) {
	return (a.f || b.f ? a.f == b.f : a.v == b.v)
		&& a.ct?.fa == b.ct?.fa // Cell format definition
		&& a.ct?.t == b.ct?.t	// Cell format type
		&& a.bg == b.bg // bg color
		&& a.fc == b.fc // font color
		&& a.ff == b.ff // font family
		&& a.fs == b.fs // font size
		&& a.cl == b.cl // cancelline
		&& a.bl == b.bl // vold
		&& a.it == b.it // italic
		&& a.vt == b.vt // vertical alignment
		&& a.ht == b.ht // horizontal alignment
		&& a.mc == b.mc // merge cell
		&& a.tb == b.tb // text wrap
}

function transformOp(rows: YSheet, op: Op) {
	console.log('OP', op.op, op.path.join('.'), op.value)
	switch (op.op) {
		case 'replace':
		case 'add':
		case 'remove':
			switch (op.path[0]) {
				case 'data': {
					let row = rows.get(+op.path[1])
					if (!row) {
						row = new Y.Array<YCell | false>()
						if (rows.length < +op.path[1]) {
							const arr = (new Array(+op.path[1] - rows.length)).fill(false)
							rows.push(arr)
						}
						rows.insert(+op.path[1], [row])
					}
					let cell = row.get(+op.path[2])
					//if (typeof cell != 'object') cell = { v: 'asdfcfe' }

					if (cell) {
						//const newCell = op.op == 'add' ? op.value
						const newCell = op.op == 'remove' ? false
							: op.path.length == 3 ? (op.value == null ? false : { ...op.value, m: undefined })
							: { ...cell, ...{ [op.path[3]]: op.value, m: undefined }}
						//if (newCell?.v != cell.get('v')) {
						console.log('change?', op.path.length, cell, newCell, compareCell(newCell, cell))
						if (!compareCell(newCell, cell)) {
							row.delete(+op.path[2])
							row.insert(+op.path[2], [newCell])
						}
					} else if (op.op != 'remove') {
						if (row.length < +op.path[2]) {
							const arr = (new Array(+op.path[2] - row.length)).fill(false)
							row.push(arr)
						}
						row.insert(+op.path[2], [op.value])
					}
					console.log('cell', cell)
				}
			}
			break
		case 'insertRowCol':
			if (op.value.type == 'row') {
				const arr = new Array(op.value.count).fill(false)
				console.log('insert rows', op, arr)
				rows.insert(op.value.index, arr)
			} else if (op.value.type == 'column') {
				const arr = new Array(op.value.count).fill(false)
				console.log('insert cols', op, arr)
				let r = 0
				for (const row of rows) {
					if (row && row.length > op.value.index) {
						console.log('extend row', r)
						row.insert(op.value.index, arr)
					}
					r++
				}
			}
			break
		case 'deleteRowCol':
			if (op.value.type == 'row') {
				console.log('delete rows', op)
				rows.delete(op.value.start, Math.min(op.value.end - op.value.start + 1, rows.length - op.value.start))
			} else if (op.value.type == 'column') {
				console.log('delete cols', op)
				let r = 0
				for (const row of rows) {
					if (row && row.length > op.value.index) {
						console.log('extend row', r)
						rows.delete(op.value.start, Math.min(op.value.end - op.value.start + 1, row.length - op.value.start))
					}
					r++
				}
			}
			break
	}
}

function applyYEvent(rows: YSheet, wb: WorkbookInstance, evt: Y.YArrayEvent<Y.Array<Cell | undefined> | undefined>) {
	if (evt.transaction.local) return

	const delta = evt.delta
	console.log('Y event', evt.path, evt.transaction.local, JSON.stringify(delta, null, 4))
	if (evt.path.length == 0) {
		// Row
		let row = 0
		console.log('Insert row', row, delta.length)
		while (delta.length) {
			const d = delta[0]
			if (d.retain) {
				row += d.retain
			} else if (d.insert) {
				const insRows = !d.insert ? [] : Array.isArray(d.insert) ? d.insert : [d.insert]
				for (const rowYArray of insRows) {
					const ins = rowYArray instanceof Y.Array ? rowYArray.toJSON() : []
					console.log('delta', row, ins)
					for (let i = 0; i < ins.length; i++) {
						console.log('setValue', row, i, ins[i].v)
						wb.setCellValue(row, i, ins[i]?.v, { type: ins[i].f ? 'f' : 'v' })
						for (const prop of ins[i]) {
							console.log('prop', prop)
							wb.setCellFormat(row, i, prop, ins[i][prop])
						}
					}
				}
			}
			delta.shift()
		}
	} else if (evt.path.length == 1) {
		// Cell
		const row = +evt.path[0]
		console.log('row', row)
		let pos = 0
		while (delta.length) {
			const d = delta[0]
			if (d.retain) {
				pos += d.retain
			//} else if (delta.length >= 2 && d.insert && delta[1].delete) {
			} else if (d.insert) {
				const ins = !d.insert ? [] : Array.isArray(d.insert) ? d.insert : [d.insert]
				//const del = delta[1].delete ?? 0
				console.log('delta', ins)
				for (let i = 0; i < ins.length; i++) {
					console.log('setValue', row, pos + i, ins[i])
					wb.setCellValue(row, pos + i, { type: ins[i].f ? 'f' : 'v' })
					for (const prop in ins[i]) {
						console.log('prop', row, pos + i, prop, ins[i][prop])
						if (!['v', 'f', 'm'].includes(prop)) wb.setCellFormat(row, pos + i, prop as keyof Cell, ins[i][prop])
					}
				}
				//delta.shift()
			} else {
				console.log('FIXME: SKIPPED DELTA!!!!!!!!!!!!!', d)
			}
			delta.shift()
		}
	}
}

function transformCellData(rows: ((Cell | undefined)[] | undefined)[]) {
	const data: CellWithRowAndCol[] = []

	let r = 0
	for (const row of rows) {
		let c = 0
		if (row) for (const cell of row) {
			if (typeof cell == 'object') {
				data.push({ r, c, v: cell })
			}
			c++
		}
		r++
	}

	console.log('transformCellData', data)
	return data
}

export function SheelloApp() {
	const { t } = useTranslation()
	const cloudillo = useCloudilloEditor(APP_NAME)
	//const yCells = cloudillo.yDoc.getMap<CellData>('cells')
	const rows = cloudillo.yDoc.getArray<YRow | false>('rows')
	const [loaded, setLoaded] = React.useState(false)
	const [origCellData, setOrigCellData] = React.useState<{ name: string, celldata: CellWithRowAndCol[] }[] | undefined>()
	const sheetRef = React.useRef<WorkbookInstance>(null)

	React.useEffect(function () {
		rows.observeDeep(evts => {
			setLoaded(true)
			if (!sheetRef.current) return

			for (const evt of evts) applyYEvent(rows, sheetRef.current, evt)
		})

		// Add user presence
		cloudillo?.provider?.awareness.setLocalStateField('user', {
			name: cloudillo.idTag,
			color: cloudillo.idTag == 'cloud.w9.hu' ? '#000088' : '#008800'
		})

		let prevSheetName: string | undefined, prevRow: number | undefined, prevColumn: number | undefined
		const refreshInterval = setInterval(function () {
			if (!sheetRef.current || !cloudillo.provider) return

			// Show awareness
			cloudillo.provider.awareness.on('change', (evt: { added: number[], updated: number[], removed: number[] }) => {
				const sheetId = sheetRef?.current?.getSheet().id
				if (!sheetId) return

				if (evt.removed.length > 0) sheetRef?.current?.removePresences(evt.removed.map(p => ({ userId: '' + p, username: '' })))
				if (evt.added.length + evt.updated.length > 0) {
					const sheets = sheetRef?.current?.getAllSheets() || []
					const awareness = cloudillo?.provider?.awareness.getStates()!

					const presences = [...evt.added, ...evt.updated].map(p => {
						const state = awareness.get(p)
						//console.log('sheets', sheets)
						const sheetId = sheets.find(s => s.name == state?.cursor?.[0])?.id
						//console.log('cursor', sheetId, state?.cursor)
						return {
							userId: '' + p,
							username: state?.user.name || '',
							sheetId: sheetId || '',
							color: '#f00',
							selection: { r: state?.cursor?.[1], c: state?.cursor?.[2] }
						}
					}).filter(p => p.selection?.r && cloudillo.yDoc.clientID != +p.userId)
					sheetRef?.current?.addPresences(presences)
				}
			})

			// Update awareness
			const selection = sheetRef.current.getSelection()
			const sheetName = sheetRef.current.getSheet().name
			const [row, column] = [selection?.[0].row[0], selection?.[0].column[0]]
			//console.log('selection', row, column, prevRow, prevColumn)
			if (sheetName != prevSheetName || row != prevRow || column != prevColumn) {
				//console.log('cursor', sheetName, row, column)
				cloudillo.provider.awareness.setLocalStateField('cursor', [sheetName, row, column])
				prevSheetName = sheetName
				prevRow = row
				prevColumn = column
			}
		}, 1000)

		return function () {
			clearInterval(refreshInterval)
		}
	}, [cloudillo.provider])
	//}, [])

	React.useEffect(function () {
		console.log('transform', rows.toJSON())
		if (loaded && !origCellData) setOrigCellData([{ name: 'Sheet1', celldata: transformCellData(rows.toJSON()) }])
	}, [loaded, origCellData])

	function onOp(ops: Op[]) {
		cloudillo.yDoc.transact(() => {
			for (const op of ops) {
				transformOp(rows, op)
			}
		})
	}

	console.log('Sheet render', origCellData)
	return origCellData && <Workbook
		ref={sheetRef}
		data={origCellData}
		onOp={onOp}
	/>
}

// vim: ts=4
