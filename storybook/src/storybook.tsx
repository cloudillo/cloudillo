// Cloudillo Storybook Utility Components
// Based on patron storybook structure

import * as React from 'react'
import { useLocation } from 'react-router'
import { Link } from 'react-router-dom'
import { atom, useAtom } from 'jotai'

/* Utils */
/*********/
function stringifyProp(value: unknown, indentDepth: number = 0) {
	const indent = ' '.repeat(indentDepth * 4)

	try {
		const s = JSON.stringify(value)
		return s.length < 60 ? s : JSON.stringify(value, (k, v) => typeof v == 'function' ? 'function ' + v.name : v, 4).replace(/\n/g, `\n${indent}`)
	} catch (err) {
		return ''
	}
}

function stringify(node: React.ReactNode, indentDepth: number = 0): string {
	if (node == null) return ''
	const indent = ' '.repeat(indentDepth * 4)

	switch (typeof node) {
		case 'string':
		case 'number':
		case 'boolean':
			return `${indent}${node}\n`
		case 'object': {
			if ((node as any)[Symbol.iterator] === 'function') {
				return `<>\n</>`
			} else if ((node as any).props) {
				const el = node as React.ReactElement
				const props = el.props as Record<string, unknown>
				const elementType = typeof el.type == 'string' ? el.type
					: typeof el.type == 'symbol' ? ''
					: (el.type as { name: string })?.name
				let propList = Object.entries(props)
					.filter(([name, value]) => value !== undefined && name !== 'children')
					.map(([name, value]) => value === true ? name : `${name}=${
						typeof value == 'function' ? `{${value.name}}`
						: typeof value == 'string' ? JSON.stringify(value)
						: '{' + stringifyProp(value, indentDepth + 1) + '}'}`)
						.join(' ')
				if (propList.length > 60) {
					propList = Object.entries(props)
						.filter(([name, value]) => value !== undefined && name !== 'children')
						.map(([name, value]) => value === true ? `\n${indent}    ${name}` : `\n${indent}    ${name}=${
							typeof value == 'function' ? `{${value.name}}`
							: typeof value == 'string' ? JSON.stringify(value)
							: '{' + stringifyProp(value, indentDepth + 1) + '}'}`)
							.join('') + `\n${indent}`
				}
				const children = (Array.isArray(props.children) ? props.children : [props.children])
					.map((child: React.ReactNode) => stringify(child, indentDepth + 1))
					.join('')
				return children ? `${indent}<${elementType}${elementType && propList ? ' ' : ''}${propList}>\n${children}${indent}</${elementType}>\n`
					: `${indent}<${elementType} ${propList}/>\n`
			}
		}
		default: return `${indent}error`
	}
}

/* Registry */
/************/
export type RegistryState = Record<string, {
	path: string
	title: string
}>

const registryAtom = atom<RegistryState>({})

export function useRegister() {
	const [reg, setReg] = useAtom(registryAtom)

	return function register(path: string, title?: string) {
		setReg(r => ({ ...r, [path]: { path, title : title ?? path }}))
	}
}

/* Components */
/**************/
export function Page({ description, children }: { description?: string, children?: React.ReactNode }) {
	const [registry] = useAtom(registryAtom)

	return <div className="sb--m-page">
		<nav className="sb--m-nav c-panel">
			<ul>
				{ Object.entries(registry).map(([path, node]) => <li key={path}>
					<Link to={path}>{node.title}</Link>
				</li>) }
			</ul>
		</nav>
		<main className="sb--m-main c-panel">
			{description && <p className="description">{description}</p>}
			{children}
		</main>
	</div>
}

type StoryPropType = string | StoryPropType[]

function StoryPropType({ type, indentDepth }: { type: StoryPropType, indentDepth?: number }): React.ReactElement {
	const indent = new Array((indentDepth || 1) - 1).fill(0).map((nll, idx) => <i key={idx}/>)

	if (typeof type == 'string') {
		return <>{indent}{type}<br/></>
	} else {
		return <>
			{type.map((t, idx) => <StoryPropType key={idx} type={t} indentDepth={(indentDepth || 0) + 1}/>)}
		</>
	}
}

interface StoryProps {
	name: string
	path?: string
	title?: string
	description?: string
	props?: { name: string, type: StoryPropType, descr?: string, required?: boolean }[]
	children?: React.ReactNode
}

export function Story({ name, path, title, description, props, children }: StoryProps) {
	const location = useLocation()
	const register = useRegister()

	React.useEffect(function () {
		register(path ?? name, title)
	}, [path ?? name, title])

	if (location.pathname != '/' + (path ?? name)) return null

	return <div className="sb--m-story">
		<h2>{title ?? name}</h2>
		<p className="description">{description}</p>
			{ props && <table className="prop-list"><tbody>
				{ props.map(prop => <tr key={prop.name}>
					<td className="name"><b>{prop.name}{prop.required && <span style={{ color: '#f88' }}>*</span>}</b></td>
						<td className="type"><StoryPropType type={prop.type}/></td>
					<td className="descr">{prop.descr}</td>
				</tr>) }
			</tbody></table> }
		{children}
	</div>
}

export function Variant({ name, description, children }: { name: string, description?: string , children: React.ReactElement}) {
	const [more, setMore] = React.useState(false)

	let code: string | undefined
	if (typeof children != 'string') {
		const elementType = children.type == 'string' ? children.type : (children.type as { name: string })?.name
		code = stringify(children)
	}

	return <div className="sb--m-variant">
		<h3>{name}</h3>
		<p className="description">{description}</p>
		{children}
		{ code && <div className={'code' + (more ? ' more' : '')}>
			<pre style={{ whiteSpace: 'pre-wrap' }}>{code}</pre>
			<button className="a-btn small" onClick={() => setMore(!more)}>{!more ? 'Show more' : 'Show less'}</button>
		</div> }
	</div>
}

// vim: ts=4
