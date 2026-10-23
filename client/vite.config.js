import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5174 so it can run beside your existing client on 5173
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 }
});
