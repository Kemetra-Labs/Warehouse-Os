import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Shell } from './Shell'
import { Adjust } from '../ui/screens/Adjust'
import { Home } from '../ui/screens/Home'
import { ItemCard } from '../ui/screens/ItemCard'
import { ItemEdit } from '../ui/screens/ItemEdit'
import { Items } from '../ui/screens/Items'
import { Settings } from '../ui/screens/Settings'
import { MovementsScreen } from './screens'

// Lazy: keeps SheetJS (xlsx) out of the main bundle until the import screen is opened.
const ImportParity = lazy(() => import('../ui/screens/ImportParity'))
// Lazy: the scanner and the ZXing fallback load only when a receipt is opened.
const ReceiptFlow = lazy(() => import('../ui/screens/ReceiptFlow'))
// Lazy: the issue screen and its sheets load only when a batch is opened.
const IssueFlow = lazy(() => import('../ui/screens/IssueFlow'))
// Lazy: the exports screen (prints, ledger rows, backup) loads only when it is opened.
const Exports = lazy(() => import('../ui/screens/Exports'))
// Lazy: the unsent screen pulls in the Excel exporter only when it is opened.
const Unsent = lazy(() => import('../ui/screens/Unsent'))

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        {/* Not lazy: the items, the card and the form must open offline without a new chunk. */}
        <Route path="items" element={<Items />} />
        <Route path="items/new" element={<ItemEdit />} />
        <Route path="items/:code" element={<ItemCard />} />
        <Route path="items/:code/edit" element={<ItemEdit />} />
        <Route path="items/:code/adjust" element={<Adjust />} />
        <Route path="settings" element={<Settings />} />
        <Route path="movements" element={<MovementsScreen />} />
        {/* The old placeholder address now lands on the exports screen. */}
        <Route path="reports" element={<Navigate to="/exports" replace />} />
        <Route
          path="exports"
          element={
            <Suspense fallback={<p>جاري التحميل...</p>}>
              <Exports />
            </Suspense>
          }
        />
        <Route
          path="import"
          element={
            <Suspense fallback={<p>جاري التحميل...</p>}>
              <ImportParity />
            </Suspense>
          }
        />
        <Route
          path="receive/:id?"
          element={
            <Suspense fallback={<p>جاري التحميل...</p>}>
              <ReceiptFlow />
            </Suspense>
          }
        />
        <Route
          path="issue/:id?"
          element={
            <Suspense fallback={<p>جاري التحميل...</p>}>
              <IssueFlow />
            </Suspense>
          }
        />
        <Route
          path="unsent"
          element={
            <Suspense fallback={<p>جاري التحميل...</p>}>
              <Unsent />
            </Suspense>
          }
        />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}
