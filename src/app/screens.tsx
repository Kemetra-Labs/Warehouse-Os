import styles from './screens.module.css'

function Placeholder({ title }: { readonly title: string }) {
  return (
    <section className={styles.panel}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>الشاشة دي لسه تحت العمل.</p>
    </section>
  )
}

export const MovementsScreen = () => <Placeholder title="الحركات" />
