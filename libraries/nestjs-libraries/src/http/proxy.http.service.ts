import axios, { AxiosResponse } from 'axios';
import { Injectable } from '@nestjs/common';
import {
  CustomAxiosClient,
  CustomAxiosRequestConfig,
} from '@gitroom/nestjs-libraries/http/custom.axios.client';
import { ProxyService } from '@gitroom/nestjs-libraries/database/prisma/proxies/proxy.service';
import { ProxyUnavailableError } from '@gitroom/nestjs-libraries/http/proxy.errors';

export type ProxyAxiosRequestConfig<D = any> = Omit<
  CustomAxiosRequestConfig<D>,
  'proxyParameter'
> & {
  proxyId?: string | null;
};

@Injectable()
export class ProxyHttpService {
  constructor(
    private _proxyService: ProxyService,
    private _customAxiosClient: CustomAxiosClient
  ) {}

  async request<T = any, R = AxiosResponse<T>, D = any>(
    config: ProxyAxiosRequestConfig<D>
  ): Promise<R> {
    const { proxyId, ...axiosConfig } = config;
    const proxyParameter = await this.resolveProxyParameter(proxyId);

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
    const proxyParameter = await this.resolveProxyParameter(proxyId);

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

  private async resolveProxyParameter(proxyId?: string | null) {
    if (!proxyId) {
      return null;
    }

    try {
      const proxy = await this._proxyService.getProxyForPosting(proxyId);
      if (!proxy) {
        throw new ProxyUnavailableError();
      }

      return proxy.proxyParameter;
    } catch (err) {
      throw new ProxyUnavailableError();
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
