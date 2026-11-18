import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../lib/auth.jsx';
import Layout from '../components/Layout.jsx';
import RequireAuth from '../components/RequireAuth.jsx';
import { ToastProvider } from '../components/ui.jsx';
import { getMockRole } from './mockApi.js';

// A full screen for Storybook: mock login for the toolbar role, app shell (sidebar) and router at `url`.
// `path` is the route pattern the page expects (for useParams), e.g. "/sesi/:code".
export function PageStory({ url, path = url, element, shell = true, guest = false }) {
  try {
    if (guest) sessionStorage.removeItem('detakita.token'); else sessionStorage.setItem('detakita.token', 'storybook-mock');
  } catch { /* storage blocked */ }
  const role = getMockRole();
  return (
    <AuthProvider key={`${role}-${guest}`}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            {guest ? <Route path={path} element={element} /> : (
              <Route element={<RequireAuth />}>
                {shell ? <Route element={<Layout />}><Route path={path} element={element} /></Route> : <Route path={path} element={element} />}
              </Route>
            )}
            <Route path="*" element={<p className="p-6 text-sm text-outline">Story ini berpindah ke halaman lain.</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
