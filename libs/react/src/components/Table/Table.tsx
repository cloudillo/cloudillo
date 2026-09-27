// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

interface TableBaseProps extends Omit<React.TableHTMLAttributes<HTMLTableElement>, 'children'> {
	/** Header labels, in cell order; each also labels its column's cells when stacked */
	columns: string[]
	variant?: 'hoverable' | 'striped' | 'compact' | 'bordered'
	/** Below 34rem of container width each row restacks into a labelled card */
	stack?: boolean
	/** `TableRow`s */
	children?: React.ReactNode
}

/** Accessible name required: a visible `caption`, or `aria-label` / `aria-labelledby` */
export type TableProps = TableBaseProps &
	(
		| { caption: React.ReactNode }
		| { caption?: undefined; 'aria-label': string }
		| { caption?: undefined; 'aria-labelledby': string }
	)

const ColumnsContext = React.createContext<string[]>([])

/** Data table over `c-table`; cells get their column label for the stacked layout */
export const Table = createComponent<HTMLTableElement, TableProps>(
	'Table',
	({ columns, variant, stack, caption, className, children, ...props }, ref) => {
		const table = (
			<table
				ref={ref}
				className={mergeClasses('c-table', variant, stack && 'stack', className)}
				{...props}
			>
				{caption != null && <caption>{caption}</caption>}
				<thead>
					<tr>
						{columns.map((col) => (
							<th key={col} scope="col">
								{col}
							</th>
						))}
					</tr>
				</thead>
				<ColumnsContext.Provider value={columns}>
					<tbody>{children}</tbody>
				</ColumnsContext.Provider>
			</table>
		)
		// The container query needs a sized ancestor
		return stack ? <div className="c-table-stack-container">{table}</div> : table
	}
)

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
	/** `TableCell`s, one per column */
	children?: React.ReactNode
}

export const TableRow = createComponent<HTMLTableRowElement, TableRowProps>(
	'TableRow',
	({ children, ...props }, ref) => {
		const columns = React.useContext(ColumnsContext)
		let i = 0
		return (
			<tr ref={ref} {...props}>
				{React.Children.map(children, (child) => {
					if (!React.isValidElement<TableCellProps>(child)) return child
					const label = columns[i++]
					return child.props.label === undefined && label !== undefined
						? React.cloneElement(child, { label })
						: child
				})}
			</tr>
		)
	}
)

export interface TableCellProps
	extends Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
	/** Stacked-layout label; defaults to the column header, `''` for none */
	label?: string
	align?: 'start' | 'end'
	children?: React.ReactNode
}

export const TableCell = createComponent<HTMLTableCellElement, TableCellProps>(
	'TableCell',
	({ label, align, className, children, ...props }, ref) => (
		<td
			ref={ref}
			data-label={label || undefined}
			className={mergeClasses(align === 'end' && 'text-right', className)}
			{...props}
		>
			{children}
		</td>
	)
)

// vim: ts=4
