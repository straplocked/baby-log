import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { UNDER_INGRESS } from './base.js'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <App smartPrefill={true} timeStep="5" unit="oz" />
)

// no service worker under HA ingress: ingress session cookies poison SW
// caches, a PWA install inside the HA panel is meaningless, and the HA
// companion app covers notifications there
if (import.meta.env.PROD && 'serviceWorker' in navigator && !UNDER_INGRESS) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'))
}
