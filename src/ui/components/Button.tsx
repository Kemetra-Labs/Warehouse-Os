import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'seal'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** `seal` (violet) is for اعتماد only: violet means posted. */
  readonly variant?: ButtonVariant
}

/** A 44 px tap target. Disabled buttons are grey with dark text, never colour alone. */
export function Button({ variant = 'secondary', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`${styles.button} ${styles[variant]}`} {...rest} />
}
