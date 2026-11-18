import { MemoryRouter } from 'react-router';
import { ToastProvider } from '../src/components/ui.jsx';
import { installMockApi, setMockRole } from '../src/mocks/mockApi.js';
import '../src/index.css';

installMockApi();

// Component stories get a router and toasts; page stories (parameters.page) bring their own router and app shell.
const withApp = (Story, context) => {
  setMockRole(context.globals.role || 'admin');
  if (context.parameters.page) return <Story />;
  return (
    <ToastProvider>
      <MemoryRouter>
        <div className="min-h-32 bg-surface p-6 font-body text-on-surface"><Story /></div>
      </MemoryRouter>
    </ToastProvider>
  );
};

/** @type {import('@storybook/react-vite').Preview} */
const preview = {
  decorators: [withApp],
  globalTypes: {
    role: {
      description: 'Peran pengguna (mock API)',
      toolbar: {
        title: 'Peran',
        icon: 'user',
        items: [{ value: 'admin', title: 'Admin' }, { value: 'doctor', title: 'Dokter' }, { value: 'nurse', title: 'Perawat' }],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { role: 'admin' },
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i } },
    a11y: { test: 'todo' },
  },
};
export default preview;
