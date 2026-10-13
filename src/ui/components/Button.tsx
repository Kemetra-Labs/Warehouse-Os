import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'seal'
/** `main` is the 64 px thumb-zone action: one per screen. `square` is a 44 px icon-sized target (−, +). */
export type ButtonSize = 'default' | 'main' | 'square'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** `primary` is the reversed bone button: the one next step. `seal` (violet) is for اعتماد only. */
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
}

/** A 44 px tap target (64 px for `main`). Disabled buttons are muted with a hollow edge, never colour alone. */
export function Button({
  variant = 'secondary',
  size = 'default',
  type = 'button',
  ...rest
}: ButtonProps) {
  const sizeClass = size === 'default' ? '' : styles[size]
  return (
    <button type={type} className={`${styles.button} ${styles[variant]} ${sizeClass}`} {...rest} />
  )
}
