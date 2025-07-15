// puppeteer.config.cjs
import { join } from 'path';

/** @type {import('puppeteer').PuppeteerConfig} */
export default {
  cacheDirectory: join(process.cwd(), '.cache/puppeteer'),
};
