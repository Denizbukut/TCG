/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-e74caca70ffd49459342dd56ea2b67c9.r2.dev',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ani-labs.xyz',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.puf.world',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'gsyzahqlbgurtldzmhyz.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig
