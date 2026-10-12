import { Route, Routes } from 'react-router'
import { Shell } from './Shell'
import { HomeScreen, ItemsScreen, MovementsScreen, ReportsScreen, UnsentScreen } from './screens'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomeScreen />} />
        <Route path="items" element={<ItemsScreen />} />
        <Route path="movements" element={<MovementsScreen />} />
        <Route path="reports" element={<ReportsScreen />} />
        <Route path="unsent" element={<UnsentScreen />} />
        <Route path="*" element={<HomeScreen />} />
      </Route>
    </Routes>
  )
}
