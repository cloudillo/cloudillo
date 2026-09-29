// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AddressBookOutput } from '@cloudillo/core'
import {
	Button,
	Icon,
	List,
	ListItem,
	Menu,
	MenuItem,
	SearchInput,
	Text,
	useDialog,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuUsers as IcAll,
	LuBookOpen as IcBook,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuEllipsisVertical as IcMore
} from 'react-icons/lu'

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

	function openBookMenu(e: React.MouseEvent<HTMLElement>, book: AddressBookOutput) {
		e.stopPropagation()
		const rect = e.currentTarget.getBoundingClientRect()
		const MENU_WIDTH = 180
		const x = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
		setBookMenu({ book, x, y: rect.bottom + 4 })
	}

	async function handleDelete(book: AddressBookOutput) {
		const confirmed = await dialog.confirm(
			t('Delete address book?'),
			t('All contacts in "{{name}}" will be permanently removed.', { name: book.name }),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (!confirmed) return
		await onDelete(book)
	}

	return (
		<VBox gap={2} padding={2} className="flex-fill h-min-0 overflow-y-auto">
			{/* Uncontrolled + debounced so typing never re-renders ContactsApp */}
			<SearchInput
				placeholder={t('Search contacts')}
				aria-label={t('Search contacts')}
				defaultValue={initialQuery}
				onSearch={onSearchChange}
				debounce={250}
			/>

			<List aria-label={t('Address books')}>
				<ListItem
					leading={<Icon as={IcAll} />}
					title={t('All contacts')}
					selected={selection === 'all'}
					onClick={() => onSelect('all')}
				/>
				{addressBooks.map((book) => (
					<ListItem
						key={book.abId}
						leading={<Icon as={IcBook} />}
						title={<Text truncate>{book.name}</Text>}
						selected={selection === book.abId}
						onClick={() => onSelect(book.abId)}
						actions={
							<Button
								variant="ghost"
								size="sm"
								immediate
								aria-label={t('More actions for {{name}}', { name: book.name })}
								aria-haspopup="menu"
								aria-expanded={bookMenu?.book.abId === book.abId}
								onClick={(e) => openBookMenu(e, book)}
								icon={<IcMore />}
							/>
						}
					/>
				))}
			</List>

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
		</VBox>
	)
}

// vim: ts=4
