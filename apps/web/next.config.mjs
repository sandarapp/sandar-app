const config = {
  poweredByHeader: false,
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts','.tsx','.js'], '.mjs': ['.mts','.mjs'] };
    return config;
  },
  async headers() {
    return [{ source: '/:path*',headers: [
      { key: 'Referrer-Policy',value: 'no-referrer' },
      { key: 'X-Content-Type-Options',value: 'nosniff' },
      { key: 'X-Frame-Options',value: 'DENY' },
      { key: 'Cache-Control',value: 'no-store' },
      { key: 'Permissions-Policy',value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy',value: "default-src 'self'; script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '') + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'" }
    ] }];
  }
};
export default config;
