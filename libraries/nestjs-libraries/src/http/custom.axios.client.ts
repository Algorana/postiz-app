import axios, {
  AxiosRequestConfig,
  AxiosResponse,
  Method,
  RawAxiosRequestHeaders,
} from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Injectable } from '@nestjs/common';
import { ProxyUnavailableError } from '@gitroom/nestjs-libraries/http/proxy.errors';

export type CustomAxiosRequestConfig<D = any> = AxiosRequestConfig<D> & {
  proxyParameter?: string | null;
};

@Injectable()
export class CustomAxiosClient {
  request<T = any, R = AxiosResponse<T>, D = any>(
    config: CustomAxiosRequestConfig<D>
  ): Promise<R> {
    const { proxyParameter, ...axiosConfig } = config;

    return axios.request<T, R, D>({
      ...axiosConfig,
      ...(proxyParameter ? this.getProxyConfig(proxyParameter) : {}),
    });
  }

  get<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: CustomAxiosRequestConfig<D>
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
    config?: CustomAxiosRequestConfig<D>
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
    config?: CustomAxiosRequestConfig<D>
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
    config?: CustomAxiosRequestConfig<D>
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
    config?: CustomAxiosRequestConfig<D>
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
    proxyParameter?: string | null
  ): Promise<Response> {
    const response = await this.request<ArrayBuffer>({
      url,
      method: (options.method || 'GET') as Method,
      headers: this.normalizeFetchHeaders(options.headers),
      data: options.body as any,
      proxyParameter,
      responseType: 'arraybuffer',
      signal: options.signal,
      validateStatus: () => true,
    });

    return new Response(response.data, {
      status: response.status,
      statusText: response.statusText,
      headers: this.toFetchHeaders(response.headers),
    });
  }

  private getProxyConfig(proxyParameter: string): AxiosRequestConfig {
    this.validateProxyUrl(proxyParameter);

    const agent = new HttpsProxyAgent(proxyParameter);
    return {
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
    };
  }

  private validateProxyUrl(proxyParameter: string) {
    try {
      const url = new URL(proxyParameter);
      if (!url.hostname || !['http:', 'https:'].includes(url.protocol)) {
        throw new ProxyUnavailableError();
      }
    } catch (err) {
      throw new ProxyUnavailableError();
    }
  }

  private normalizeFetchHeaders(
    headers?: HeadersInit
  ): RawAxiosRequestHeaders | undefined {
    if (!headers) {
      return undefined;
    }

    if (headers instanceof Headers) {
      const normalized: RawAxiosRequestHeaders = {};
      headers.forEach((value, key) => {
        normalized[key] = value;
      });
      return normalized;
    }

    if (Array.isArray(headers)) {
      return headers.reduce<RawAxiosRequestHeaders>((all, [key, value]) => {
        all[key] = value;
        return all;
      }, {});
    }

    return headers as RawAxiosRequestHeaders;
  }

  private toFetchHeaders(headers: AxiosResponse['headers']): Headers {
    const fetchHeaders = new Headers();
    for (const [key, value] of Object.entries(headers || {})) {
      if (Array.isArray(value)) {
        fetchHeaders.set(key, value.join(', '));
        continue;
      }

      if (value !== undefined && value !== null) {
        fetchHeaders.set(key, String(value));
      }
    }

    return fetchHeaders;
  }
}
