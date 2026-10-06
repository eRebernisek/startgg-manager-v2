import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'gg.startmanager.app',
  appName: 'Start.gg Manager',
  webDir: 'dist/startgg-manager-v2/browser',
  plugins: {
    // Routes window.fetch through native HTTP on Android, which bypasses CORS.
    // Required for the token-less public endpoint (www.start.gg/api/-/gql).
    CapacitorHttp: { enabled: true },
  },
};

export default config;
