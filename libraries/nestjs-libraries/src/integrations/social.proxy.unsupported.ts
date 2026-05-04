// Providers listed here use SDKs, WebSockets, or direct native fetch/axios in the posting path.
// When a proxy is selected they fail closed instead of silently posting directly.
export const PROXY_UNSUPPORTED_POSTING_PROVIDERS = new Set([
  'bluesky',
  'discord',
  'dribbble',
  'lemmy',
  'medium',
  'mewe',
  'moltbook',
  'nostr',
  'pinterest',
  'reddit',
  'skool',
  'slack',
  'telegram',
  'twitch',
  'vk',
  'wrapcast',
  'x',
  'youtube',
]);

export const isProxyUnsupportedPostingProvider = (provider: string) =>
  PROXY_UNSUPPORTED_POSTING_PROVIDERS.has(provider);
