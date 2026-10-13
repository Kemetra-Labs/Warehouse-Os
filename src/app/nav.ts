export type NavIcon = 'home' | 'items' | 'movements' | 'exports'

export interface NavItem {
  readonly to: string
  readonly label: string
  readonly icon: NavIcon
  readonly end?: boolean
}

/** Bottom navigation, in reading order (RTL: the first item sits at the right). */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: 'home', end: true },
  { to: '/items', label: 'الأصناف', icon: 'items' },
  { to: '/movements', label: 'الحركات', icon: 'movements' },
  { to: '/exports', label: 'التصدير', icon: 'exports' },
]

export const HOSPITAL_NAME = 'مستشفى القناطر الخيرية'
export const STORE_NAME = 'مخزن الشرائح والمسامير'
