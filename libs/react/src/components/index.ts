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

// Utilities
export {
	mergeClasses,
	createComponent,
	useId,
	buttonSizeClass,
	avatarSizeClass,
	generateFragments
} from './utils.js'

// Types
export type * from './types.js'

// Avatar Components
export { Avatar, AvatarStatus, AvatarBadge, AvatarGroup } from './Avatar/index.js'
export type {
	AvatarProps,
	AvatarStatusProps,
	AvatarBadgeProps,
	AvatarGroupProps
} from './Avatar/index.js'

// Badge Component
export { Badge } from './Badge/index.js'
export type { BadgeProps } from './Badge/index.js'

// Box Components
export { HBox, VBox, Group } from './Box/index.js'
export type { HBoxProps, VBoxProps, GroupProps } from './Box/index.js'

// Button Components
export { Button, LinkButton, IconButton } from './Button/index.js'
export type { ButtonProps, LinkButtonProps, IconButtonProps } from './Button/index.js'

// Dropdown Component
export { Dropdown } from './Dropdown/index.js'
export type { DropdownProps } from './Dropdown/index.js'

// Form Components
export { Input, TextArea, NativeSelect, InputGroup, Fieldset, Toggle } from './Form/index.js'
export type {
	InputProps,
	TextAreaProps,
	NativeSelectProps,
	InputGroupProps,
	FieldsetProps,
	ToggleProps
} from './Form/index.js'

// Modal Component
export { Modal } from './Modal/index.js'
export type { ModalProps } from './Modal/index.js'

// Nav Components
export { Nav, NavGroup, NavItem, NavLink } from './Nav/index.js'
export type { NavProps, NavGroupProps, NavItemProps, NavLinkProps } from './Nav/index.js'

// Panel Component
export { Panel } from './Panel/index.js'
export type { PanelProps } from './Panel/index.js'

// Progress Component
export { Progress } from './Progress/index.js'
export type { ProgressProps } from './Progress/index.js'

// Sidebar Components
export {
	useSidebar,
	SidebarContext,
	useSidebarContext,
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarFooter,
	SidebarNav,
	SidebarSection,
	SidebarBackdrop,
	SidebarToggle,
	SidebarResizeHandle
} from './Sidebar/index.js'
export type {
	SidebarState,
	UseSidebarOptions,
	UseSidebarReturn,
	SidebarContextValue,
	SidebarProps,
	SidebarContentProps,
	SidebarHeaderProps,
	SidebarFooterProps,
	SidebarNavProps,
	SidebarSectionProps,
	SidebarBackdropProps,
	SidebarToggleProps,
	SidebarResizeHandleProps
} from './Sidebar/index.js'

// Tab Components
export { Tabs, TabsContext, Tab } from './Tab/index.js'
export type { TabsProps, TabsContextValue, TabProps } from './Tab/index.js'

// Tag Components
export { Tag, TagList } from './Tag/index.js'
export type { TagProps, TagListProps } from './Tag/index.js'

// Toast Components
export {
	useToast,
	ToastContext,
	useToastContext,
	ToastContainer,
	Toast,
	ToastIcon,
	ToastContent,
	ToastTitle,
	ToastMessage,
	ToastActions,
	ToastClose,
	ToastProgress
} from './Toast/index.js'
export type {
	ToastData,
	ToastOptions,
	UseToastReturn,
	ToastContextValue,
	ToastContainerProps,
	ToastProps,
	ToastIconProps,
	ToastContentProps,
	ToastTitleProps,
	ToastMessageProps,
	ToastActionsProps,
	ToastCloseProps,
	ToastProgressProps
} from './Toast/index.js'

// Popper Component
export { Popper } from './Popper/index.js'
export type { PopperProps } from './Popper/index.js'

// Container Component
export { Container } from './Container/index.js'
export type { ContainerProps } from './Container/index.js'

// Fcd Components (Filter/Content/Details layout)
export { Fcd, FcdContainer, FcdFilter, FcdContent, FcdDetails } from './Fcd/index.js'
export type {
	FcdContainerProps,
	FcdFilterProps,
	FcdContentProps,
	FcdDetailsProps
} from './Fcd/index.js'

// Profile Components
export {
	UnknownProfilePicture,
	ProfilePicture,
	IdentityTag,
	ProfileCard,
	ProfileAudienceCard
} from './Profile/index.js'
export type {
	UnknownProfilePictureProps,
	ProfilePictureProps,
	IdentityTagProps,
	Profile,
	ProfileCardProps,
	ProfileAudienceCardProps
} from './Profile/index.js'

// Dialog Components
export { Dialog, DialogContainer, useDialog } from './Dialog/index.js'
export type { DialogProps, UseDialogReturn } from './Dialog/index.js'

// EditProfileList Component
export { EditProfileList } from './EditProfileList/index.js'
export type { EditProfileListProps } from './EditProfileList/index.js'

// Select Component
export { Select } from './Select/index.js'
export type { SelectProps } from './Select/index.js'

// NumberInput Component
export { NumberInput } from './NumberInput/index.js'
export type { NumberInputProps } from './NumberInput/index.js'

// ColorInput Component
export { ColorInput } from './ColorInput/index.js'
export type { ColorInputProps } from './ColorInput/index.js'

// Loading Components
export {
	LoadingSpinner,
	Skeleton,
	SkeletonText,
	SkeletonCard,
	SkeletonList
} from './Loading/index.js'
export type {
	LoadingSpinnerProps,
	SkeletonVariant,
	SkeletonProps,
	SkeletonTextProps,
	SkeletonCardProps,
	SkeletonListProps
} from './Loading/index.js'

// InlineEdit Components
export { InlineEditForm } from './InlineEdit/index.js'
export type { InlineEditFormProps } from './InlineEdit/index.js'

// FilterBar Components
export {
	FilterBar,
	FilterBarComponent,
	FilterBarItem,
	FilterBarDivider,
	FilterBarSection,
	FilterBarSearch
} from './FilterBar/index.js'
export type {
	FilterBarProps,
	FilterBarItemProps,
	FilterBarDividerProps,
	FilterBarSectionProps,
	FilterBarSearchProps
} from './FilterBar/index.js'

// EmptyState Component
export { EmptyState } from './EmptyState/index.js'
export type { EmptyStateProps, EmptyStateSize } from './EmptyState/index.js'

// PropertyPanel Components
export { PropertyPanel, PropertySection, PropertyField } from './PropertyPanel/index.js'
export type {
	PropertyPanelProps,
	PropertySectionProps,
	PropertyFieldProps
} from './PropertyPanel/index.js'

// TreeView Components
export { TreeView, TreeItem } from './TreeView/index.js'
export type { TreeViewProps, TreeItemProps, TreeItemDragData } from './TreeView/index.js'

// TimeFormat Component
export { TimeFormat } from './TimeFormat/index.js'
export type { TimeFormatProps } from './TimeFormat/index.js'

// vim: ts=4
