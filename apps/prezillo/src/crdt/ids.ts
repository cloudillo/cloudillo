// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Branded ID types for compile-time safety
 * Using branded types ensures we don't accidentally mix up different ID types
 */

import { randomId } from '@cloudillo/core'

export type ObjectId = string & { readonly __brand: 'ObjectId' }
export type ContainerId = string & { readonly __brand: 'ContainerId' }
export type ViewId = string & { readonly __brand: 'ViewId' }
export type StyleId = string & { readonly __brand: 'StyleId' }
export type TemplateId = string & { readonly __brand: 'TemplateId' }

// Type converters
export const toObjectId = (s: string): ObjectId => s as ObjectId
export const toContainerId = (s: string): ContainerId => s as ContainerId
export const toViewId = (s: string): ViewId => s as ViewId
export const toStyleId = (s: string): StyleId => s as StyleId
export const toTemplateId = (s: string): TemplateId => s as TemplateId

export const generateObjectId = (): ObjectId => toObjectId(randomId())
export const generateContainerId = (): ContainerId => toContainerId(randomId())
export const generateViewId = (): ViewId => toViewId(randomId())
export const generateStyleId = (): StyleId => toStyleId(randomId())
export const generateTemplateId = (): TemplateId => toTemplateId(randomId())

// vim: ts=4
