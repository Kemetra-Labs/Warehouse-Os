import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/almarai/400.css'
import '@fontsource/almarai/700.css'
import '@fontsource/almarai/800.css'
import './ui/tokens.css'
import { App } from './app/App'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
