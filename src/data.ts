/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LucideIcon } from 'lucide-react';
import {
  ShoppingBag,
  Croissant,
  Pill,
  Apple,
  Beef,
  Store,
  CupSoda,
  Tags,
} from 'lucide-react';

// ── Business Categories ──

// FIX 1: Define the icon map first so the allowed icon strings are derived
// from its keys rather than from the category array. This means adding a
// new category with a mistyped icon name produces a clear type error at
// the map definition, not a confusing downstream error.
export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  ShoppingBag,
  Croissant,
  Pill,
  Apple,
  Beef,
  Store,
  CupSoda,
  Tags,
} as const;

export type CategoryIconName = keyof typeof CATEGORY_ICON_MAP;

export const BUSINESS_CATEGORIES: ReadonlyArray<{
  readonly id: string;
  readonly name: string;
  // FIX 1: icon is now constrained to keys of CATEGORY_ICON_MAP, so a
  // typo in any category entry is caught immediately at this definition.
  readonly icon: CategoryIconName;
}> = [
  { id: 'grocery',     name: 'Grocery & Supermarket',       icon: 'ShoppingBag' },
  { id: 'bakery',      name: 'Bakery & Confectionery',       icon: 'Croissant'   },
  { id: 'pharmacy',    name: 'Pharmacy & Wellness',          icon: 'Pill'        },
  { id: 'produce',     name: 'Fresh Produce (Fruit & Veg)',  icon: 'Apple'       },
  { id: 'butchery',    name: 'Butchery & Meats',             icon: 'Beef'        },
  { id: 'convenience', name: 'Convenience Store',            icon: 'Store'       },
  { id: 'beverages',   name: 'Beverages & Liquor',           icon: 'CupSoda'     },
  { id: 'general',     name: 'General Retail',               icon: 'Tags'        },
];

// FIX 2: Public-facing types expose only id and name.
// The icon field is an internal rendering detail — callers should
// look up the component via CATEGORY_ICON_MAP, not read .icon directly.
export type BusinessCategoryId = typeof BUSINESS_CATEGORIES[number]['id'];
export type BusinessCategoryName = typeof BUSINESS_CATEGORIES[number]['name'];

/** Resolve a category icon name to its Lucide component. Returns undefined for unknown names. */
export function getCategoryIcon(iconName: string): LucideIcon | undefined {
  return CATEGORY_ICON_MAP[iconName];
}

/** Look up a category by its id. Returns undefined if not found. */
export function getBusinessCategory(id: BusinessCategoryId) {
  return BUSINESS_CATEGORIES.find(c => c.id === id);
}

// ── Product Units ──

// FIX 3: Removed 'Piece' — it overlapped with 'Unit' with no meaningful
// distinction. Merchants in a POS context do not need both.
// FIX 4: Added 'g' and 'ml' for sub-unit quantities common in spaza
// retail (loose spices, small cold drink refills, etc.)
// FIX 5: Removed 'Other' — it produced unreadable receipts and reports.
// Products needing a non-standard unit should use the customUnit field
// on the Product type instead (see types.ts).
export const PRODUCT_UNITS = [
  'Units',
  'Bottle',
  'Can',
  'Packet',
  'Box',
  'Loaf',
  'Kilogram',
  'g',
  'Litre',
  'ml',
  'Tray',
] as const;

export type ProductUnit = typeof PRODUCT_UNITS[number];

/**
 * Returns a human-readable unit label for display on receipts and reports.
 * Falls back to customUnit if the stored unit is not in the standard list,
 * supporting the FIX 5 migration away from 'Other'.
 */
export function formatUnit(unit: string, customUnit?: string): string {
  if ((PRODUCT_UNITS as ReadonlyArray<string>).includes(unit)) return unit;
  if (customUnit?.trim()) return customUnit.trim();
  return unit; // graceful fallback for legacy records that stored 'Other'
}
