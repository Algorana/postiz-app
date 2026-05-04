export const PROXY_UNAVAILABLE_MESSAGE =
  'Posting failed because the selected proxy is unavailable.';

export class ProxyUnavailableError extends Error {
  constructor() {
    super(PROXY_UNAVAILABLE_MESSAGE);
    this.name = 'ProxyUnavailableError';
  }
}
