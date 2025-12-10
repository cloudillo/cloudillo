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
	LuListChecks as IcTaskillo
} from 'react-icons/lu'

export const fileIcons: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
	'image/jpeg': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/png': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'video/mp4': (props) => <IcVideo {...props} style={{ color: 'lch(50 50 0)' }} />,
	'application/pdf': (props) => <IcDocument {...props} style={{ color: 'lch(50 50 0)' }} />,
	'cloudillo/quillo': (props) => <IcQuillo {...props} style={{ color: 'lch(50 50 250)' }} />,
	'cloudillo/calcillo': (props) => <IcCalcillo {...props} style={{ color: 'lch(50 50 150)' }} />,
	'cloudillo/ideallo': (props) => <IcIdeallo {...props} style={{ color: 'lch(50 50 60)' }} />,
	'cloudillo/prezillo': (props) => <IcPrezillo {...props} style={{ color: 'lch(50 50 100)' }} />,
	'cloudillo/formillo': (props) => <IcFormillo {...props} style={{ color: 'lch(50 50 300)' }} />,
	'cloudillo/taskillo': (props) => <IcTaskillo {...props} style={{ color: 'lch(50 50 180)' }} />,
	'cloudillo/folder': (props) => <IcFolder {...props} style={{ color: 'lch(55 40 70)' }} />
}

export function getFileIcon(
	contentType: string,
	fileTp?: string
): React.ComponentType<React.SVGProps<SVGSVGElement>> {
	if (fileTp === 'FLDR') {
		return fileIcons['cloudillo/folder'] || IcFolder
	}
	return fileIcons[contentType] || IcUnknown
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
	IcTaskillo
}

// vim: ts=4
