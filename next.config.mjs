const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: 's3.tradingview.com' }, { protocol: 'https', hostname: 'upload.wikimedia.org' }] }
};
export default nextConfig;
