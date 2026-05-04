import { timer } from '@gitroom/helpers/utils/timer';
import { Integration } from '@prisma/client';
import { ApplicationFailure } from '@temporalio/activity';
import { SocialPostingProxyContext } from '@gitroom/nestjs-libraries/integrations/social.posting.proxy.context';
import {
  PROXY_UNAVAILABLE_MESSAGE,
  ProxyUnavailableError,
} from '@gitroom/nestjs-libraries/http/proxy.errors';

export class RefreshToken extends ApplicationFailure {
  constructor(identifier: string, json: string, body: BodyInit, message = '') {
    super(message, 'refresh_token', true, [
      {
        identifier,
        json,
        body,
      },
    ]);
  }
}

export class BadBody extends ApplicationFailure {
  constructor(identifier: string, json: string, body: BodyInit, message = '') {
    super(message, 'bad_body', true, [
      {
        identifier,
        json,
        body,
      },
    ]);
  }
}

export class NotEnoughScopes {
  constructor(
    public message = 'Not enough scopes, when choosing a provider, please add all the scopes'
  ) {}
}

function safeStringify(obj: any) {
  const seen = new WeakSet();

  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

function isPostizMediaSourceUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const safeDirectOrigins = [
      process.env.CLOUDFLARE_BUCKET_URL,
      process.env.FRONTEND_URL,
      process.env.NEXT_PUBLIC_BACKEND_URL,
    ].filter(Boolean) as string[];

    if (parsedUrl.hostname.endsWith('imagedelivery.net')) {
      return true;
    }

    return safeDirectOrigins.some((origin) => {
      try {
        const parsedOrigin = new URL(origin);
        return parsedOrigin.origin === parsedUrl.origin;
      } catch (err) {
        return url.startsWith(origin);
      }
    });
  } catch (err) {
    return true;
  }
}

export abstract class SocialAbstract {
  abstract identifier: string;
  maxConcurrentJob = 1;

  public handleErrors(
    body: string,
    status: number,
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    return undefined;
  }

  public async mention(
    token: string,
    d: { query: string },
    id: string,
    integration: Integration
  ): Promise<
    | { id: string; label: string; image: string; doNotCache?: boolean }[]
    | { none: true }
  > {
    return { none: true };
  }

  async runInConcurrent<T>(
    func: (...args: any[]) => Promise<T>,
    ignoreConcurrency?: boolean
  ) {
    let value: any;
    try {
      value = await func();
    } catch (err) {
      const handle = this.handleErrors(safeStringify(err), 200);
      value = { err: true, value: 'Unknown Error', ...(handle || {}) };
    }

    if (value && value?.err && value?.value) {
      if (value.type === 'refresh-token') {
        throw new RefreshToken(
          '',
          safeStringify({}),
          {} as any,
          value.value || ''
        );
      }
      throw new BadBody('', safeStringify({}), {} as any, value.value || '');
    }

    return value;
  }

  async fetch(
    url: string,
    options: RequestInit = {},
    identifier = '',
    totalRetries = 0,
    ignoreConcurrency = false
  ): Promise<Response> {
    const normalizedOptions = options || {};
    const proxyContext = SocialPostingProxyContext.getStore();
    let request: Response;

    try {
      request =
        proxyContext?.proxyId && !isPostizMediaSourceUrl(url)
          ? await proxyContext.proxyHttpService.fetch(
              url,
              normalizedOptions,
              proxyContext.proxyId
            )
          : await fetch(url, normalizedOptions);
    } catch (err) {
      if (err instanceof ProxyUnavailableError) {
        throw new BadBody(
          identifier,
          '{}',
          normalizedOptions.body || '{}',
          PROXY_UNAVAILABLE_MESSAGE
        );
      }

      throw err;
    }

    if (request.status === 200 || request.status === 201) {
      return request;
    }

    if (totalRetries > 2) {
      throw new BadBody(identifier, '{}', options.body || '{}');
    }

    let json = '{}';
    try {
      json = await request.text();
    } catch (err) {
      json = '{}';
    }

    const handleError = this.handleErrors(json || '{}', request.status);

    if (
      request.status === 429 ||
      (request.status === 500 && !handleError) ||
      json.includes('rate_limit_exceeded') ||
      json.includes('Rate limit')
    ) {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency
      );
    }

    if (handleError?.type === 'retry') {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency
      );
    }

    if (
      (request.status === 401 &&
        (handleError?.type === 'refresh-token' || !handleError)) ||
      handleError?.type === 'refresh-token'
    ) {
      throw new RefreshToken(
        identifier,
        json,
        options.body!,
        handleError?.value
      );
    }

    throw new BadBody(
      identifier,
      json,
      options.body!,
      handleError?.value || ''
    );
  }

  checkScopes(required: string[], got: string | string[]) {
    if (Array.isArray(got)) {
      if (!required.every((scope) => got.includes(scope))) {
        throw new NotEnoughScopes();
      }

      return true;
    }

    const newGot = decodeURIComponent(got);

    const splitType = newGot.indexOf(',') > -1 ? ',' : ' ';
    const gotArray = newGot.split(splitType);
    if (!required.every((scope) => gotArray.includes(scope))) {
      throw new NotEnoughScopes();
    }

    return true;
  }
}
