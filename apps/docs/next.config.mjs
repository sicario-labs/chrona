const { createMDX } = require('fumadocs-mdx/config');
const withMDX = createMDX();
/** @type {import('next').NextConfig} */
const config = { reactStrictMode: true };
module.exports = withMDX(config);
