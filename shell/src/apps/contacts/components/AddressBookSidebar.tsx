// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPencil as IcEdit,
	LuTrash as IcDelete,
	LuBookOpen as IcBook,
	LuUsers as IcAll,
	LuSearch as IcSearch,
	LuEllipsisVertical as IcMore
} from 'react-icons/lu'

import { Menu, MenuItem, useDebouncedValue, useDialog, mergeClasses } from '@cloudillo/react'
import type { AddressBookOutput } from '@cloudillo/core'

import type { AddressBookSelection } from '../types.js'

export interface AddressBookSidebarProps {
	addressBooks: AddressBookOutput[]
	selection: AddressBookSelection
	onSelect: (selection: AddressBookSelection) => void
	onRename: (book: AddressBookOutput) => void
	onDelete: (book: AddressBookOutput) => Promise<void>
	/** Restored query (read once for local input init); updates are pushed via onSearchChange. */
	initialQuery?: string
	/** Called with the debounced value only, so the parent doesn't re-render on every keystroke. */
	onSearchChange: (q: string) => void
}

interface BookMenuState {
	book: AddressBookOutput
	x: number
	y: number
}

export function AddressBookSidebar({
	addressBooks,
	selection,
	onSelect,
	onRename,
	onDelete,
	initialQuery = '',
	onSearchChange
}: AddressBookSidebarProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const [bookMenu, setBookMenu] = React.useState<BookMenuState | null>(null)

	// Owning the input state locally keeps typing from re-rendering ContactsApp
	// on every keystroke — the parent only hears about the debounced value.
	const [input, setInput] = React.useState(initialQuery)
	const debouncedInput = useDebouncedValue(input, 250)
	React.useEffect(
		function commitDebouncedQuery() {
			onSearchChange(debouncedInput)
		},
		[debouncedInput, onSearchChange]
	)

	function openBookMenu(e: React.MouseEvent<HTMLButtonElement>, book: AddressBookOutput) {
		e.stopPropagation()
		const rect = e.currentTarget.getBoundingClientRect()
		const MENU_WIDTH = 180
		const x = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
		setBookMenu({ book, x, y: rect.bottom + 4 })
	}

	async function handleDelete(book: AddressBookOutput) {
		const confirmed = await dialog.confirm(
			t('Delete address book?'),
			t('All contacts in "{{name}}" will be permanently removed.', { name: book.name })
		)
		if (!confirmed) return
		await onDelete(book)
	}

	return (
		<div className="c-ab-sidebar">
			<div className="c-input-group">
				<span className="d-flex align-items-center px-2" aria-hidden="true">
					<IcSearch />
				</span>
				<input
					className="c-input"
					type="search"
					placeholder={t('Search contacts')}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					aria-label={t('Search contacts')}
				/>
			</div>

			<div className="c-ab-list" role="list">
				<button
					type="button"
					role="listitem"
					aria-current={selection === 'all' ? 'page' : undefined}
					className={mergeClasses('c-ab-item', selection === 'all' && 'active')}
					onClick={() => onSelect('all')}
				>
					<IcAll />
					<span className="c-ab-item__name">{t('All contacts')}</span>
				</button>

				{addressBooks.map((book) => {
					const isActive = selection === book.abId
					return (
						<div
							key={book.abId}
							role="listitem"
							className={mergeClasses('c-ab-item', isActive && 'active')}
						>
							<button
								type="button"
								className="c-ab-item__select d-flex align-items-center g-2 flex-fill text-left"
								onClick={() => onSelect(book.abId)}
								aria-current={isActive ? 'page' : undefined}
							>
								<IcBook />
								<span className="c-ab-item__name">{book.name}</span>
							</button>
							<button
								type="button"
								className="c-link c-ab-item__menu-trigger"
								title={t('More actions')}
								aria-label={t('More actions for {{name}}', { name: book.name })}
								aria-haspopup="menu"
								aria-expanded={bookMenu?.book.abId === book.abId}
								onClick={(e) => openBookMenu(e, book)}
							>
								<IcMore />
							</button>
						</div>
					)
				})}
			</div>

			{bookMenu && (
				<Menu position={{ x: bookMenu.x, y: bookMenu.y }} onClose={() => setBookMenu(null)}>
					<MenuItem
						icon={<IcEdit />}
						label={t('Rename')}
						onClick={() => {
							const book = bookMenu.book
							setBookMenu(null)
							onRename(book)
						}}
					/>
					<MenuItem
						icon={<IcDelete />}
						label={t('Delete')}
						danger
						onClick={() => {
							const book = bookMenu.book
							setBookMenu(null)
							void handleDelete(book)
						}}
					/>
				</Menu>
			)}
		</div>
	)
}

// vim: ts=4
