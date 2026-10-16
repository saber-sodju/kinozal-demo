import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { Footer, Header } from './components/Header'
import { Ambient } from './components/Motion'
import { ToastProvider } from './components/Toasts'
import './index.css'
import { CatalogPage } from './pages/Catalog'
import { ExtensionPage } from './pages/Extension'
import { FilmPage } from './pages/Film'
import { LandingPage } from './pages/Landing'
import { NewRoomPage } from './pages/NewRoom'
import { NotFoundPage } from './pages/NotFound'
import { ReportPage } from './pages/Report'
import { RoomPage } from './pages/Room'
import { SettingsPage } from './pages/Settings'
import { SearchPage } from './pages/Search'
import { SourcesPage } from './pages/Sources'
import { TgLinkPage } from './pages/TgLink'

function Layout() {
  const location = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <Ambient />
      <Header />
      {/* key — плавное появление при переходе между страницами */}
      <main key={location.pathname} className="fade-in flex-1">
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
            <Route path="search" element={<SearchPage />} />
            <Route path="extension" element={<ExtensionPage />} />
            <Route path="film/:id" element={<FilmPage />} />
            <Route path="new" element={<NewRoomPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="tgf/:token" element={<TgLinkPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="r/:slug" element={<RoomPage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
)
