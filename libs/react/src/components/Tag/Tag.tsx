// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuChevronDown as IcCaret, LuX as IcClose } from 'react-icons/lu'
import { Link as RouterLink } from 'react-router-dom'

import { useLibTranslation } from '../../i18n.js'
import type { ColorVariant, Size } from '../types.js'
import { createComponent, isCrossOrigin, isInternal, mergeClasses } from '../utils.js'

interface TagBaseProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> {
	color?: ColorVariant
	/** OpalUI tags have two off-default sizes: xs/sm render small, lg/xl large. */
	size?: Size
	/** Leading icon (a react-icon or an emoji). */
	icon?: React.ReactNode
	/** Leading avatar, e.g. `<Avatar size="xs" …/>`. */
	avatar?: React.ReactNode
	/** Trailing counter, e.g. a reaction count. */
	count?: number
	children?: React.ReactNode
}

/** A clickable chip: filter toggle, tag-cloud link, reaction, or a menu trigger (`caret`). */
interface TagActionProps {
	onClick?: React.MouseEventHandler<HTMLElement>
	/** `/…` renders a router `Link`, anything else an `<a>`. */
	href?: string
	/** Toggle state: `aria-pressed` plus the pressed look (buttons only). */
	pressed?: boolean
	/** Draws a dropdown caret; pass the Tag as a `Menu` `trigger`. */
	caret?: boolean
	onRemove?: never
	removeLabel?: never
}

/** A removable chip: the chip itself is static, only its remove button acts. */
interface TagRemoveProps {
	onRemove: () => void
	/** Overrides the remove button's `Remove {label}` aria-label. */
	removeLabel?: string
	onClick?: never
	href?: never
	pressed?: never
	caret?: never
}

/** `onClick`/`href` + `pressed` + `caret`, or `onRemove` — never both. */
export type TagProps = TagBaseProps & (TagActionProps | TagRemoveProps)

function textOf(node: React.ReactNode): string | undefined {
	if (typeof node === 'string' || typeof node === 'number') return String(node)
	if (Array.isArray(node) && node.every((n) => typeof n === 'string' || typeof n === 'number'))
		return node.join('')
	return undefined
}

export const Tag = createComponent<HTMLElement, TagProps>(
	'Tag',
	(
		{
			className,
			color,
			size,
			icon,
			avatar,
			count,
			onClick,
			href,
			pressed,
			caret,
			onRemove,
			removeLabel,
			children,
			...props
		},
		ref
	) => {
		const { t } = useLibTranslation()
		const label = textOf(children)
		const interactive = !!href || !!onClick || !!caret

		const classes = mergeClasses(
			'c-tag',
			color,
			(size === 'xs' || size === 'sm') && 'small',
			(size === 'lg' || size === 'xl') && 'large',
			interactive && 'interactive',
			pressed && 'pressed',
			onRemove && 'removable',
			className
		)

		const content = (
			<>
				{avatar}
				{icon && (
					<span className="c-tag-icon" aria-hidden="true">
						{icon}
					</span>
				)}
				{children}
				{count !== undefined && <span className="c-tag-count">{count}</span>}
				{caret && <IcCaret className="c-tag-caret" aria-hidden="true" />}
			</>
		)

		if (href) {
			const linkProps = {
				...props,
				ref: ref as React.Ref<HTMLAnchorElement>,
				className: classes,
				onClick
			}
			return isInternal(href) ? (
				<RouterLink to={href} {...linkProps}>
					{content}
				</RouterLink>
			) : (
				<a href={href} rel={isCrossOrigin(href) ? 'noopener' : undefined} {...linkProps}>
					{content}
				</a>
			)
		}

		if (interactive) {
			return (
				<button
					type="button"
					ref={ref as React.Ref<HTMLButtonElement>}
					className={classes}
					aria-pressed={pressed}
					onClick={onClick}
					{...props}
				>
					{content}
				</button>
			)
		}

		return (
			<span ref={ref} className={classes} {...props}>
				{content}
				{onRemove && (
					<button
						type="button"
						className="c-tag-remove"
						onClick={(evt) => {
							evt.stopPropagation()
							onRemove()
						}}
						aria-label={
							removeLabel ?? (label ? t('Remove {{label}}', { label }) : t('Remove'))
						}
					>
						<IcClose size="0.8em" />
					</button>
				)}
			</span>
		)
	}
)

// vim: ts=4
