// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Table, TableCell, TableRow } from '@cloudillo/react'
import * as React from 'react'
import { LuTrash2 as IcDelete } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

const rows = [
	{ path: '/', doc: 'Home', updated: '2026-09-20' },
	{ path: '/blog', doc: 'Blog index', updated: '2026-09-18' },
	{ path: '/about', doc: 'About us', updated: '2026-08-02' }
]

export function TableStory() {
	return (
		<Story
			name="Table"
			description="Data table over c-table. Cells take their column header as the stacked-layout label."
			props={[
				{
					name: 'columns',
					type: 'string[]',
					descr: 'Header labels, in cell order',
					required: true
				},
				{
					name: 'caption',
					type: 'ReactNode',
					descr: 'Visible name (else aria-label is required)'
				},
				{
					name: 'aria-label',
					type: 'string',
					descr: 'Accessible name when there is no caption'
				},
				{
					name: 'variant',
					type: "'hoverable' | 'striped' | 'compact' | 'bordered'",
					descr: 'Look'
				},
				{
					name: 'stack',
					type: 'boolean',
					descr: 'Below 34rem of container width rows become cards'
				},
				{
					name: 'TableCell label',
					type: 'string',
					descr: "Override the column label ('' for none)"
				},
				{ name: 'TableCell align', type: "'start' | 'end'", descr: 'Cell alignment' }
			]}
		>
			<Variant name="Hoverable">
				<Table
					aria-label="Published pages"
					variant="hoverable"
					columns={['Path', 'Document', 'Updated']}
				>
					{rows.map((r) => (
						<TableRow key={r.path}>
							<TableCell>{r.path}</TableCell>
							<TableCell>{r.doc}</TableCell>
							<TableCell>{r.updated}</TableCell>
						</TableRow>
					))}
				</Table>
			</Variant>

			<Variant name="Stacked in a narrow container (20rem)">
				<div style={{ maxWidth: '20rem' }}>
					<Table
						caption="Published pages"
						variant="compact"
						stack
						columns={['Path', 'Document', '']}
					>
						{rows.map((r) => (
							<TableRow key={r.path}>
								<TableCell>{r.path}</TableCell>
								<TableCell>{r.doc}</TableCell>
								<TableCell align="end">
									<Button
										variant="ghost"
										icon={<IcDelete />}
										aria-label="Remove"
									/>
								</TableCell>
							</TableRow>
						))}
					</Table>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
