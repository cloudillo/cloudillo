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
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { usePopper } from 'react-popper'

import {
	LuX as IcClose,

	LuSmile as EmSmile,
	LuLaugh as EmLaugh,
	LuFrown as EmSad,
	LuMeh as EmMeh,
	LuHeart as EmHeart,
} from 'react-icons/lu'

import { delay } from '@cloudillo/base'

import { useAuth } from './hooks.js'

export function mergeClasses(...classes: (string | false | undefined)[]) {
	return classes.filter(c => c).join(' ')
}

interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
	className?: string
	onClick?: (evt: React.MouseEvent) => void
	type?: 'button' | 'submit'
	disabled?: boolean
	icon?: React.ReactNode
	primary?: boolean
	secondary?: boolean
	accent?: boolean
	link?: boolean
	children?: React.ReactNode
}

/**********/
/* Button */
/**********/
export function Button({ className, onClick, icon, primary, secondary, accent, link, children, ...props }: ButtonProps) {
	const [cls, setCls] = React.useState('')
	const variantClass =
		primary ? 'primary'
		: secondary ? 'secondary'
		: accent ? 'accent'
		: undefined

	async function handleClick(evt: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
		evt.preventDefault()
		setCls(' clicked')
		await delay(200)
		setCls('')
		if (props.type == 'submit') {
			(evt.target as HTMLButtonElement).form?.requestSubmit()
		} else {
			onClick?.(evt)
		}
	}

	if (icon) {
		return <button {...props}
			className={mergeClasses(link ? 'c-link' : 'c-button', 'g-2', variantClass, cls, className)}
			onClick={handleClick}
		>
			{icon}
			{children}
		</button>
	} else {
		return <button
			{...props}
			className={mergeClasses(link ? 'c-link' : 'c-button', variantClass, cls, className)}
			onClick={handleClick}
		>
			{children}
		</button>
	}
}

/**********/
/* Popper */
/**********/
interface PopperProps {
	className?: string
	menuClassName?: string
	icon?: React.ReactNode
	label?: React.ReactNode
	children?: React.ReactNode
}
export function Popper({ className, menuClassName, icon, label, children, ...props }: PopperProps) {
	const [popperRef, setPopperRef] = React.useState<HTMLElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLElement | null>(null)
	const [isOpen, setIsOpen] = React.useState(false)
	const { styles: popperStyles, attributes } = usePopper(popperRef, popperEl, {
		placement: 'bottom-start',
		strategy: 'fixed'
	})

	/*
	*/
	React.useEffect(() => {
		if (!popperEl) return

		async function handleClickOutside(evt: MouseEvent) {
			if (!(evt.target instanceof Node) || !popperEl?.contains(evt.target)) {
				evt.stopPropagation()
				evt.preventDefault()
				setIsOpen(false)
			}
			/*
			await delay(200)
			setIsOpen(false)
			*/
		}

		document.addEventListener("click", handleClickOutside, true)
		return () => {
			document.removeEventListener("click", handleClickOutside, true)
		}
	}, [popperEl]);

	return <details className={className} open={isOpen} onClick={evt => (evt.stopPropagation(), setIsOpen(!isOpen))}>
		<summary ref={setPopperRef} className={menuClassName || "c-nav-item g-2"} onClick={evt => (evt.stopPropagation(), setIsOpen(!isOpen))}>
			{icon}{label}
		</summary>
		{isOpen && createPortal(<div ref={setPopperEl} style={popperStyles.popper} onClick={evt => setIsOpen(false)} {...attributes.popper}>
		{/*
		{(isOpen || popperEl) && createPortal(<div ref={setPopperEl} style={popperStyles.popper} onClick={evt => setIsOpen(false)} {...attributes.popper}>
		*/}
			{children}
		</div>, document.getElementById('popper-container')!)}
	</details>
}

/*************/
/* Container */
/*************/
export function Container({ className, children }: { className?: string, children: React.ReactNode }) {
	return <main className={mergeClasses('c-container h-100 overflow-y-auto', className)}>
		{children}
	</main>
}

/****************/
/* FcbContainer */
/****************/
function FcbContainer({ className, children }: { className?: string, children: React.ReactNode }) {
	return <main className={mergeClasses('c-container w-100 h-100', className)}>
		<div className="row h-100">
			{children}
		</div>
	</main>
}

function FcbFilter({ className, isVisible, hide, children }: { className?: string, isVisible?: boolean, hide?: () => void, children?: React.ReactNode }) {
	return <div className={mergeClasses('c-vbox sm-hide hide-left col-md-4 col-lg-3 h-100 overflow-y-auto', className, isVisible && 'show')} onClick={hide}>
		<Button link className="pos absolute top-0 right-0 m-1 z-4 md-hide lg-hide" onClick={hide}><IcClose/></Button>
		<div className="w-100" onClick={evt => evt.stopPropagation()}>
			{children}
		</div>
	</div>
}

const FcbContent = React.forwardRef(function FcbContentInside({ className, onScroll, header, children }: { className?: string, onScroll?: () => void, header?: React.ReactNode, children?: React.ReactNode }, ref: React.Ref<HTMLDivElement>) {

	return <div className={mergeClasses('c-vbox col col-md-8 col-lg-6 h-100', className)}>
		{header}
		<div ref={ref} className={mergeClasses('c-vbox fill overflow-y-auto', className)} onScroll={onScroll}>
			{children}
		</div>
	</div>

	/*
	return <div ref={ref} className={mergeClasses('c-vbox col col-md-8 col-lg-6 h-100 overflow-y-auto', className)} onScroll={onScroll}>
		{children}
	</div>
	*/
})

function FcbDetails({ isVisible, className, hide, children }: { isVisible?: boolean, className?: string, hide?: () => void, children?: React.ReactNode }) {
	return <div className={mergeClasses('c-vbox sm-hide md-hide hide-right col-lg-3 h-100 overflow-y-auto', className, isVisible && 'show')} onClick={hide}>
		<Button link className="pos absolute top-0 right-0 m-1 z-4 md-hide lg-hide" onClick={hide}><IcClose/></Button>
		<div className="z-1 w-100 h-min-100" onClick={evt => evt.stopPropagation()}>
			{children}
		</div>
	</div>
}

export const Fcb = {
	Container: FcbContainer,
	Filter: FcbFilter,
	Content: FcbContent,
	Details: FcbDetails
}

/***********/
/* Profile */
/***********/
export function UnknownProfilePicture({ small }: { small?: boolean }) {
	return <svg className={'picture' + (small ? ' small' : '')} viewBox="0 0 24 24" fill="none">
		<path d="M12 22.01C17.5228 22.01 22 17.5329 22 12.01C22 6.48716 17.5228 2.01001 12 2.01001C6.47715 2.01001 2 6.48716 2 12.01C2 17.5329 6.47715 22.01 12 22.01Z" fill="#ADB3BA"/>
		<path d="M12 6.93994C9.93 6.93994 8.25 8.61994 8.25 10.6899C8.25 12.7199 9.84 14.3699 11.95 14.4299C11.98 14.4299 12.02 14.4299 12.04 14.4299C12.06 14.4299 12.09 14.4299 12.11 14.4299C12.12 14.4299 12.13 14.4299 12.13 14.4299C14.15 14.3599 15.74 12.7199 15.75 10.6899C15.75 8.61994 14.07 6.93994 12 6.93994Z" fill="#292D32"/>
		<path d="M18.7807 19.36C17.0007 21 14.6207 22.01 12.0007 22.01C9.3807 22.01 7.0007 21 5.2207 19.36C5.4607 18.45 6.1107 17.62 7.0607 16.98C9.7907 15.16 14.2307 15.16 16.9407 16.98C17.9007 17.62 18.5407 18.45 18.7807 19.36Z" fill="#292D32"/>
	</svg>
}

interface Profile {
	name?: string
	idTag: string
	profilePic?: string
}

export function ProfilePicture({ className, profile, small }: { className?: string, profile: { profilePic?: string }, small?: boolean }) {
	const [auth] = useAuth()

	return <div className="c-profile-card">
		{ auth && profile.profilePic
			//? <img className={'picture' + (small ? ' small' : '')} src={`https://cl-o.${profile.idTag}/api/store/${profile.profilePic}`}/>
			? <img className={'picture' + (small ? ' small' : '')} src={`https://cl-o.${auth.idTag}/api/store/${profile.profilePic}`}/>
			: <UnknownProfilePicture small={small}/>
		}
	</div>
}

export function IdentityTag({ className, idTag = '-' }: { className?: string, idTag?: string }) {
	const segments = idTag.match(/([a-zA-Z\.]+|[^a-zA-Z\.]+)/g) || []

	return <span>
		@
		{segments.map((segment, i) => <span key={i} className={/[^a-zA-Z\.]/.test(segment) ? 'text-warning' : undefined}>{segment}</span>)}
	</span>
}

export function ProfileCard({ className, profile }: { className?: string, profile: Profile }) {
	const [auth] = useAuth()

	return <div className={mergeClasses('c-profile-card', className)}>
		{/*
		<img className="picture" src={`https://cl-o.${profile.idTag}/api/store/${profile.profilePic}`}/>
		*/}
		{ auth && profile.profilePic
			? <img className="picture" src={`https://cl-o.${auth?.idTag}/api/store/${profile.profilePic}`}/>
			: <UnknownProfilePicture	/>
		}
		<div className="body">
			<h4 className="name">{profile.name}</h4>
			<div className="tag"><IdentityTag idTag={profile.idTag}/></div>
		</div>
	</div>
}

export function ProfileAudienceCard({ className, audience, profile }: { className?: string, audience: Profile, profile: Profile }) {
	const [auth] = useAuth()

	return <div className={mergeClasses('c-profile-card', className)}>
		<div className="pos relative">
			{/*
			<img className="picture" src={`https://cl-o.${audience.idTag}/api/store/${audience.profilePic}`}/>
			<img className="picture tiny" src={`https://cl-o.${profile.idTag}/api/store/${profile.profilePic}`}/>
			*/}
			{ auth && audience.profilePic
				? <img className="picture" src={`https://cl-o.${auth?.idTag}/api/store/${audience.profilePic}`}/>
				: <UnknownProfilePicture/>
			}
			{ auth && profile.profilePic
				? <img className="picture tiny" src={`https://cl-o.${auth?.idTag}/api/store/${profile.profilePic}`}/>
				: <UnknownProfilePicture small/>
			}
		</div>
		<div className="body">
			<div className="c-hbox">
				<h4 className="name">{audience.name}</h4>
				<div className="tag">(<IdentityTag idTag={audience.idTag}/>)</div>
			</div>
			<div className="c-hbox">
				<h4 className="name">{profile.name}</h4>
				<div className="tag">(<IdentityTag idTag={profile.idTag}/>)</div>
			</div>
		</div>
	</div>
}

/*********************/
/* generateFragments */
/*********************/
const emojis: Record<string, React.ReactNode> = {
	':)': <EmSmile size="1em"/>, //'🙂',
	':D': <EmLaugh size="1em"/>, //'😀',
	':P': '😛',
	';P': '😜',
	':|': <EmMeh size="1em"/>, //'😐',
	':(': <EmSad size="1em"/>, //'🙁',
	//':O': '😮',
	//':.(': '😢',
	'<3': <EmHeart size="1em"/>, //'❤️️',
	'::': <img src="https://w9.hu/w9.png"/>
	//'::': <span><img src="https://w9.hu/w9.png"/><span className="d-inline-block" style={{ width: 0, overflow: 'hidden' }}>::</span></span>
}

export function generateFragments(text: string): React.ReactNode[] {
	const fragments: React.ReactNode[] = []

	for (const w of text.split(/(\s+)/)) {
		let n: React.ReactNode = w

		switch (w[0]) {
			case 'h':
				if (w.match(/^https?:\/\//)) {
					if (w.startsWith(`https://${window.location.host}/`)) {
						n = <Link to={w.replace(`https://${window.location.host}/`, '/')}>{w}</Link>
					} else {
						n = <a href={w} target="_blank">{w}</a>
					}
				}
				break
			case '#':
				if (w.match(/^#\S+/)) {
					n = <span className="c-tag">{w}</span>
				}
				break
			case ':':
			case ';':
			case '<':
			case '8':
				const emoji = emojis[w]
				if (typeof emoji == 'object') {
					n = <span>{emojis[w]}<span className="d-inline-block" style={{ width: 0, overflow: 'hidden' }}>{w}</span></span>
				} else {
					n = emoji || w
				}
				break
		}
		//if (typeof n == 'string') n = htmlEncode(n)
		const last = fragments[fragments.length - 1]
		if (typeof n == 'string' && typeof last == 'string') {
			fragments[fragments.length - 1] = last + n
		} else {
			fragments.push(n)
		}
	}
	return fragments
}

// vim: ts=4
