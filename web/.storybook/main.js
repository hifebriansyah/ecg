import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

// Storybook for the DETAKITA web app. Component stories need nothing; page stories run against a mock API
// (src/mocks/mockApi.js) so every screen can be seen without logging in to the real Worker.
/** @type {import('@storybook/react-vite').StorybookConfig} */
const config = {
  stories: ['../src/**/*.stories.@(js|jsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  viteFinal: (base) => mergeConfig(base, { base: './', plugins: [tailwindcss()] }),
};
export default config;
