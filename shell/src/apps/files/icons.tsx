// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import {
	FiImage as IcImage,
	FiFilm as IcVideo,
	FiFileText as IcDocument,
	FiFile as IcUnknown,
	FiFolder as IcFolder
} from 'react-icons/fi'

import {
	LuBookOpen as IcQuillo,
	LuSheet as IcCalcillo,
	LuShapes as IcIdeallo,
	LuPresentation as IcPrezillo,
	LuListTodo as IcFormillo,
	LuListChecks as IcTaskillo,
	LuNotebook as IcNotillo,
	LuScanLine as IcScanillo
} from 'react-icons/lu'

export const fileIcons: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
	'image/jpeg': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/png': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/webp': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/avif': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/gif': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/svg+xml': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'video/mp4': (props) => <IcVideo {...props} style={{ color: 'lch(50 50 0)' }} />,
	'application/pdf': (props) => <IcDocument {...props} style={{ color: 'lch(50 50 0)' }} />,
	'cloudillo/quillo': (props) => <IcQuillo {...props} style={{ color: 'lch(50 50 250)' }} />,
	'cloudillo/calcillo': (props) => <IcCalcillo {...props} style={{ color: 'lch(50 50 150)' }} />,
	'cloudillo/ideallo': (props) => <IcIdeallo {...props} style={{ color: 'lch(50 50 60)' }} />,
	'cloudillo/prezillo': (props) => <IcPrezillo {...props} style={{ color: 'lch(50 50 100)' }} />,
	'cloudillo/formillo': (props) => <IcFormillo {...props} style={{ color: 'lch(50 50 300)' }} />,
	'cloudillo/taskillo': (props) => <IcTaskillo {...props} style={{ color: 'lch(50 50 180)' }} />,
	'cloudillo/notillo': (props) => <IcNotillo {...props} style={{ color: 'lch(50 50 30)' }} />,
	'cloudillo/scanillo': (props) => <IcScanillo {...props} style={{ color: 'lch(50 50 210)' }} />,
	'cloudillo/folder': (props) => <IcFolder {...props} style={{ color: 'lch(55 40 70)' }} />
}

export function getFileIcon(
	contentType: string,
	fileTp?: string
): React.ComponentType<React.SVGProps<SVGSVGElement>> {
	if (fileTp === 'FLDR') {
		return fileIcons['cloudillo/folder'] || IcFolder
	}
	if (fileIcons[contentType]) {
		return fileIcons[contentType]
	}
	// Fallback for any image/* or video/* type
	if (contentType.startsWith('image/')) {
		return (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />
	}
	if (contentType.startsWith('video/')) {
		return (props) => <IcVideo {...props} style={{ color: 'lch(50 50 0)' }} />
	}
	return IcUnknown
}

export {
	IcImage,
	IcVideo,
	IcDocument,
	IcUnknown,
	IcFolder,
	IcQuillo,
	IcCalcillo,
	IcIdeallo,
	IcPrezillo,
	IcFormillo,
	IcTaskillo,
	IcNotillo,
	IcScanillo
}

// vim: ts=4
