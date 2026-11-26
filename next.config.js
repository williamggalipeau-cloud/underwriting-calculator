/** @type {import('next').NextConfig} */
// Hosting (user, 11/25, 1.1.7): GitHub Pages serves the site under
// /underwriting-calculator; Vercel serves it at the root of its own address.
// Vercel sets VERCEL=1 during its builds, so the same code builds for both
// while the move is checked; GitHub Pages is switched off afterwards.
// NEXT_PUBLIC_BASE_PATH carries the base path to the browser code that builds
// URLs by hand (lib/assetPhotos.js BASE_PATH: sample photos and documents).
const basePath = process.env.VERCEL ? "" : "/underwriting-calculator";

const nextConfig = {
  output: "export",
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
