import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router'
import { Footer, Header } from './components/Header'
import { ToastProvider } from './components/Toasts'
import './index.css'
import { CatalogPage } from './pages/Catalog'
import { FilmPage } from './pages/Film'
import { LandingPage } from './pages/Landing'
import { NewRoomPage } from './pages/NewRoom'
import { NotFoundPage } from './pages/NotFound'
import { ReportPage } from './pages/Report'
import { RoomPage } from './pages/Room'
import { SettingsPage } from './pages/Settings'
import { SourcesPage } from './pages/Sources'

function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="film/:id" element={<FilmPage />} />
            <Route path="new" element={<NewRoomPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="r/:slug" element={<RoomPage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
)
