export interface NavItem {
  readonly to: string
  readonly label: string
  readonly end?: boolean
}

/** Bottom navigation, in reading order (RTL: the first item sits at the right). */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'الرئيسية', end: true },
  { to: '/items', label: 'الأصناف' },
  { to: '/movements', label: 'الحركات' },
  { to: '/reports', label: 'التقارير' },
]

export const HOSPITAL_NAME = 'مستشفى القناطر الخيرية'
export const STORE_NAME = 'مخزن الشرائح والمسامير'
