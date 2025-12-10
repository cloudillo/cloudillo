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
import { mergeClasses, createComponent } from '../utils.js'
import { Tag } from '../Tag/index.js'

export interface TagSuggestion {
	tag: string
	count?: number
	isNew?: boolean
}

export interface TagInputProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	tags: string[]
	onAddTag: (tag: string) => void
	onRemoveTag: (tag: string) => void
	getSuggestions?: (query: string) => Promise<TagSuggestion[]>
	placeholder?: string
	disabled?: boolean
	inline?: boolean
}

export const TagInput = createComponent<HTMLDivElement, TagInputProps>(
	'TagInput',
	(
		{
			tags,
			onAddTag,
			onRemoveTag,
			getSuggestions,
			placeholder = 'Add tag...',
			disabled,
			inline,
			className,
			...props
		},
		ref
	) => {
		const [query, setQuery] = React.useState('')
		const [suggestions, setSuggestions] = React.useState<TagSuggestion[]>([])
		const [isOpen, setIsOpen] = React.useState(false)
		const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
		const inputRef = React.useRef<HTMLInputElement>(null)

		// Fetch suggestions when query changes
		React.useEffect(
			function fetchSuggestions() {
				if (!query || !getSuggestions) {
					setSuggestions([])
					setIsOpen(false)
					return
				}

				let cancelled = false
				getSuggestions(query).then((results) => {
					if (!cancelled) {
						setSuggestions(results)
						setIsOpen(results.length > 0)
						setHighlightedIndex(-1)
					}
				})

				return () => {
					cancelled = true
				}
			},
			[query, getSuggestions]
		)

		function handleInputChange(evt: React.ChangeEvent<HTMLInputElement>) {
			setQuery(evt.target.value)
		}

		function handleKeyDown(evt: React.KeyboardEvent<HTMLInputElement>) {
			switch (evt.key) {
				case 'Enter':
					evt.preventDefault()
					if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
						addTag(suggestions[highlightedIndex].tag)
					} else if (query.trim()) {
						addTag(query.trim())
					}
					break
				case 'Escape':
					setIsOpen(false)
					setQuery('')
					break
				case 'ArrowDown':
					evt.preventDefault()
					setHighlightedIndex((i) => (i < suggestions.length - 1 ? i + 1 : i))
					break
				case 'ArrowUp':
					evt.preventDefault()
					setHighlightedIndex((i) => (i > 0 ? i - 1 : -1))
					break
				case 'Backspace':
					if (!query && tags.length > 0) {
						onRemoveTag(tags[tags.length - 1])
					}
					break
			}
		}

		function addTag(tag: string) {
			const normalizedTag = tag.toLowerCase().replace(/^#/, '')
			if (normalizedTag && !tags.includes(normalizedTag)) {
				onAddTag(normalizedTag)
			}
			setQuery('')
			setIsOpen(false)
			inputRef.current?.focus()
		}

		function handleSuggestionClick(tag: string) {
			addTag(tag)
		}

		return (
			<div
				ref={ref}
				className={mergeClasses('c-tag-input', inline && 'inline', className)}
				{...props}
			>
				<div className="c-tag-input-field">
					{tags.map((tag) => (
						<Tag
							key={tag}
							size="small"
							onRemove={disabled ? undefined : () => onRemoveTag(tag)}
						>
							#{tag}
						</Tag>
					))}
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={handleInputChange}
						onKeyDown={handleKeyDown}
						placeholder={tags.length === 0 ? placeholder : ''}
						disabled={disabled}
					/>
				</div>
				{isOpen && suggestions.length > 0 && (
					<ul className="c-tag-input-suggestions">
						{suggestions.map((suggestion, index) => (
							<li
								key={suggestion.tag}
								className={mergeClasses(
									'c-tag-input-suggestion',
									index === highlightedIndex && 'highlighted'
								)}
								onClick={() => handleSuggestionClick(suggestion.tag)}
							>
								<Tag size="small">#{suggestion.tag}</Tag>
								{suggestion.count !== undefined && (
									<span className="c-tag-input-suggestion-count">
										({suggestion.count})
									</span>
								)}
								{suggestion.isNew && (
									<span className="c-tag-input-suggestion-new">Create new</span>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		)
	}
)

// vim: ts=4
