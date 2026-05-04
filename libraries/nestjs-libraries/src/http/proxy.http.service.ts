import axios, { AxiosResponse } from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import {
  CustomAxiosClient,
  CustomAxiosRequestConfig,
} from '@gitroom/nestjs-libraries/http/custom.axios.client';
import { ProxyService } from '@gitroom/nestjs-libraries/database/prisma/proxies/proxy.service';
import type { PostingProxy } from '@gitroom/nestjs-libraries/database/prisma/proxies/proxy.repository';
import { ProxyUnavailableError } from '@gitroom/nestjs-libraries/http/proxy.errors';

export type ProxyAxiosRequestConfig<D = any> = Omit<
  CustomAxiosRequestConfig<D>,
  'proxyParameter'
> & {
  proxyId?: string | null;
};

@Injectable()
export class ProxyHttpService {
  private readonly logger = new Logger(ProxyHttpService.name);

  constructor(
    private _proxyService: ProxyService,
    private _customAxiosClient: CustomAxiosClient
  ) {}

  async request<T = any, R = AxiosResponse<T>, D = any>(
    config: ProxyAxiosRequestConfig<D>
  ): Promise<R> {
    const { proxyId, ...axiosConfig } = config;
    const proxy = await this.resolveProxy(proxyId);
    const proxyParameter = proxy?.proxyParameter || null;

    if (proxy) {
      this.logProxiedRequest(proxy, axiosConfig.method, axiosConfig.url);
    }

    try {
      return await this._customAxiosClient.request<T, R, D>({
        ...axiosConfig,
        proxyParameter,
      });
    } catch (err) {
      this.handleProxyError(proxyParameter, err);
      throw err;
    }
  }

  get<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: ProxyAxiosRequestConfig<D>
  ): Promise<R> {
    return this.request<T, R, D>({
      ...config,
      url,
      method: 'GET',
    });
  }

  post<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: ProxyAxiosRequestConfig<D>
  ): Promise<R> {
    return this.request<T, R, D>({
      ...config,
      url,
      data,
      method: 'POST',
    });
  }

  put<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: ProxyAxiosRequestConfig<D>
  ): Promise<R> {
    return this.request<T, R, D>({
      ...config,
      url,
      data,
      method: 'PUT',
    });
  }

  patch<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: ProxyAxiosRequestConfig<D>
  ): Promise<R> {
    return this.request<T, R, D>({
      ...config,
      url,
      data,
      method: 'PATCH',
    });
  }

  delete<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: ProxyAxiosRequestConfig<D>
  ): Promise<R> {
    return this.request<T, R, D>({
      ...config,
      url,
      method: 'DELETE',
    });
  }

  async fetch(
    url: string,
    options: RequestInit = {},
    proxyId?: string | null
  ): Promise<Response> {
    const proxy = await this.resolveProxy(proxyId);
    const proxyParameter = proxy?.proxyParameter || null;

    if (proxy) {
      this.logProxiedRequest(proxy, options.method || 'GET', url);
    }

    try {
      return await this._customAxiosClient.fetch(
        url,
        options,
        proxyParameter
      );
    } catch (err) {
      this.handleProxyError(proxyParameter, err);
      throw err;
    }
  }

  private async resolveProxy(
    proxyId?: string | null
  ): Promise<PostingProxy | null> {
    if (!proxyId) {
      return null;
    }

    try {
      const proxy = await this._proxyService.getProxyForPosting(proxyId);
      if (!proxy) {
        throw new ProxyUnavailableError();
      }

      return proxy;
    } catch (err) {
      throw new ProxyUnavailableError();
    }
  }

  private logProxiedRequest(
    proxy: PostingProxy,
    method?: string,
    targetUrl?: string
  ) {
    this.logger.log(
      `Proxied provider HTTP request ${JSON.stringify({
        proxyId: proxy.id,
        proxyName: proxy.name,
        method: String(method || 'GET').toUpperCase(),
        targetOrigin: this.getSafeTargetOrigin(targetUrl),
      })}`
    );
  }

  private getSafeTargetOrigin(targetUrl?: string) {
    if (!targetUrl) {
      return undefined;
    }

    try {
      const url = new URL(targetUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return undefined;
      }

      return `${url.protocol}//${url.host}`;
    } catch (err) {
      return undefined;
    }
  }

  private handleProxyError(proxyParameter: string | null, err: unknown) {
    if (!proxyParameter) {
      return;
    }

    if (err instanceof ProxyUnavailableError) {
      throw err;
    }

    if (axios.isAxiosError(err)) {
      if (err.config) {
        delete err.config.httpAgent;
        delete err.config.httpsAgent;
      }

      if (!err.response) {
        throw new ProxyUnavailableError();
      }
    }
  }
}
