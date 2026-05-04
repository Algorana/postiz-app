import { AsyncLocalStorage } from 'async_hooks';
import type { ProxyHttpService } from '@gitroom/nestjs-libraries/http/proxy.http.service';

export type SocialPostingProxyContextValue = {
  proxyId?: string | null;
  providerIdentifier: string;
  proxyHttpService: ProxyHttpService;
};

const storage = new AsyncLocalStorage<SocialPostingProxyContextValue>();

export class SocialPostingProxyContext {
  static run<T>(
    context: SocialPostingProxyContextValue,
    callback: () => Promise<T>
  ): Promise<T> {
    return storage.run(context, callback);
  }

  static getStore() {
    return storage.getStore();
  }
}
