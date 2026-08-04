import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lean, self-contained server for the Fly runtime image (fly/Dockerfile.web).
  output: 'standalone',
  // This app has its own lockfile; keep tracing scoped to web/ (not the API repo).
  outputFileTracingRoot: __dirname,
  // Allow Server Actions when the app is reached through a Cloudflare tunnel or
  // Fly. Quick tunnels use a random *.trycloudflare.com host each run; add your
  // own custom domain here too if you run a named tunnel or map a domain.
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '*.trycloudflare.com', '*.fly.dev'],
    },
  },
};

export default nextConfig;
