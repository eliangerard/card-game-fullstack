import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { useStore } from './store/useStore'
import './index.css'

// Sólo en desarrollo: el store queda a la mano para depurar y para las pruebas e2e (que lo leen, no lo escriben)
if (import.meta.env.DEV) window.__ronaStore = useStore

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
