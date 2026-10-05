import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:5124' } }, build: { outDir: '../backend/PropCare.Api/wwwroot', emptyOutDir: true } });
