// Regression guard for the bot filter used by /click/[slug] apply-click logging.
// Triggered by 2026-05-26 audit: apply_clicks.internal hit 8,951/day vs a
// trailing daily baseline of ~10-50, and spot-check of recent UAs confirmed
// the spike was crawler/scraper traffic. The filter must catch the obvious
// bots without false-positive on real browsers.

import { describe, expect, it } from 'vitest'
import { looksLikeBot } from './bot-filter'

describe('looksLikeBot', () => {
  it('returns true for missing UA', () => {
    expect(looksLikeBot(null)).toBe(true)
    expect(looksLikeBot('')).toBe(true)
  })

  it('flags major search engine crawlers', () => {
    const uas = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
      'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
      'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(true)
  })

  it('flags SEO scrapers', () => {
    const uas = [
      'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
      'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
      'Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)',
      'Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)',
      'Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(true)
  })

  it('flags LLM training scrapers explicitly', () => {
    // Critical: these must match by NAME, not by accidental "crawler"/
    // "agent" substrings in their help URLs. If a vendor drops the help
    // URL or changes format, our filter must still catch them.
    const uas = [
      'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
      'meta-externalagent/1.1', // bare form — no help URL
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0',
      'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
      'Mozilla/5.0 (compatible; anthropic-ai)',
      'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
      'CCBot/2.0 (https://commoncrawl.org/faq/)',
      'Mozilla/5.0 (Linux; Android 7.0;) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Amazonbot/0.1)',
      'Mozilla/5.0 (compatible) Applebot-Extended',
      'Mozilla/5.0 PerplexityBot/1.0',
      'Mozilla/5.0 YouBot',
      'Mozilla/5.0 (compatible; cohere-ai)',
      'Mozilla/5.0 (compatible; Diffbot/0.1)',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(true)
  })

  it('flags Node + Python + Go HTTP libraries used by scrapers', () => {
    const uas = [
      'Scrapy/2.11.1 (+https://scrapy.org)',
      'node-fetch/3.3.2',
      'got/13.0.0 (https://github.com/sindresorhus/got)',
      'reqwest/0.11.27',
      'aiohttp/3.9.5',
      'undici/6.13.0',
      'node-superagent/9.0',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(true)
  })

  it('flags link previewers and chat clients', () => {
    const uas = [
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Twitterbot/1.0',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0)',
      'WhatsApp/2.21.12.21 A',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'TelegramBot (like TwitterBot)',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(true)
  })

  it('flags headless test harnesses', () => {
    const uas = [
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/124.0.6367.91',
      'Mozilla/5.0 Puppeteer',
      'Mozilla/5.0 (compatible) Playwright/1.40.0',
      'Mozilla/5.0 Selenium/4.10',
      'PhantomJS/2.1.1',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(true)
  })

  it('flags generic HTTP libraries', () => {
    const uas = [
      'curl/8.4.0',
      'Wget/1.21.4',
      'python-requests/2.31.0',
      'Python-urllib/3.12',
      'Go-http-client/1.1',
      'Java/17.0.2',
      'Apache-HttpClient/5.3 (Java/17.0.2)',
      'okhttp/4.12.0',
      'axios/1.6.0',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(true)
  })

  it('does NOT flag real desktop browsers', () => {
    const uas = [
      // Chrome / Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      // Safari / Mac
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      // Firefox / Linux
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
      // Edge
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(false)
  })

  it('does NOT flag real mobile browsers', () => {
    const uas = [
      // iOS Safari (iPhone)
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      // Android Chrome
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      // Samsung Internet
      'Mozilla/5.0 (Linux; Android 13; SM-S908U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
    ]
    for (const ua of uas) expect(looksLikeBot(ua)).toBe(false)
  })
})
