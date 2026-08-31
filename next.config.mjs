/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Every page here is either static markup or a client component talking to
  // the Lambda directly — nothing needs a Node server at request time. Exporting
  // to plain files means Netlify serves the site from its CDN with no functions
  // involved, which is both faster and free.
  output: 'export',

  // Static hosts serve /upload/index.html rather than /upload, so the links
  // need the trailing slash to resolve on a hard refresh.
  trailingSlash: true,

  images: { unoptimized: true },
};

export default nextConfig;
