import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

// Storybook for the DETAKITA web app. Component stories need nothing; page stories run against a mock API
// (src/mocks/mockApi.js) so every screen can be seen without logging in to the real Worker.
const FAKE_LOGINS = {
  admin: { email: 'inara@detakita.med.id', password: 'contoh-sandi-admin' },
  doctor: { email: 'dokter@detakita.med.id', password: 'contoh-sandi-dokter' },
  nurse: { email: 'perawat@detakita.med.id', password: 'contoh-sandi-perawat' },
};

/** @type {import('@storybook/react-vite').StorybookConfig} */
const config = {
  stories: ['../src/**/*.stories.@(js|jsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // Never take the real test logins from web/.env.local into Storybook (a built Storybook could be published).
  // The login story gets obviously fake ones so the autofill can still be seen.
  viteFinal: (base) => mergeConfig(base, {
    base: './',
    plugins: [tailwindcss()],
    define: { 'import.meta.env.VITE_DEMO_LOGINS': JSON.stringify(JSON.stringify(FAKE_LOGINS)) },
  }),
};
export default config;
