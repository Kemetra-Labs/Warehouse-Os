import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { Shell } from './Shell'
import { Home } from '../ui/screens/Home'
import { ItemsScreen, MovementsScreen, ReportsScreen } from './screens'

// Lazy: keeps SheetJS (xlsx) out of the main bundle until the import screen is opened.
const ImportParity = lazy(() => import('../ui/screens/ImportParity'))
// Lazy: the scanner and the ZXing fallback load only when a receipt is opened.
const ReceiptFlow = lazy(() => import('../ui/screens/ReceiptFlow'))
// Lazy: the issue screen and its sheets load only when a batch is opened.
const IssueFlow = lazy(() => import('../ui/screens/IssueFlow'))
// Lazy: the unsent screen pulls in the Excel exporter only when it is opened.
const Unsent = lazy(() => import('../ui/screens/Unsent'))

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="items" element={<ItemsScreen />} />
        <Route path="movements" element={<MovementsScreen />} />
        <Route path="reports" element={<ReportsScreen />} />
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
