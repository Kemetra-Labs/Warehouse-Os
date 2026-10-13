import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { Shell } from './Shell'
import { HomeScreen, ItemsScreen, MovementsScreen, ReportsScreen, UnsentScreen } from './screens'

// Lazy: keeps SheetJS (xlsx) out of the main bundle until the import screen is opened.
const ImportParity = lazy(() => import('../ui/screens/ImportParity'))
// Lazy: the scanner and the ZXing fallback load only when a receipt is opened.
const ReceiptFlow = lazy(() => import('../ui/screens/ReceiptFlow'))

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomeScreen />} />
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
        <Route path="unsent" element={<UnsentScreen />} />
        <Route path="*" element={<HomeScreen />} />
      </Route>
    </Routes>
  )
}
