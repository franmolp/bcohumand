import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['web-push', 'pdfjs-dist'],
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Incluir el worker de pdfjs en el bundle de Vercel Lambda
  // (no es un import estático → file-tracing no lo detecta automáticamente)
  outputFileTracingIncludes: {
    '/api/liquidador/recibos/procesar': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    ],
  },
};

export default nextConfig;
