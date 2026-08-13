import tailwindcss from "@tailwindcss/vite";
// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://mexillum-web.vercel.app',
	output: 'server',
	adapter: vercel(),
	integrations: [sitemap()],
	vite: {
		plugins: [tailwindcss()],
	},
});
