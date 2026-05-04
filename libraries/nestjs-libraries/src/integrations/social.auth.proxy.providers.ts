export const AUTH_PROXY_PROVIDER_IDENTIFIERS = [
  'tiktok',
  'instagram-standalone',
] as const;

export type AuthProxyProviderIdentifier =
  (typeof AUTH_PROXY_PROVIDER_IDENTIFIERS)[number];

export function isAuthProxyProviderIdentifier(
  identifier: string
): identifier is AuthProxyProviderIdentifier {
  return (AUTH_PROXY_PROVIDER_IDENTIFIERS as readonly string[]).includes(
    identifier
  );
}
