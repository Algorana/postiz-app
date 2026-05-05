'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { IntegrationProxyDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.proxy.dto';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';
import { FC, useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';

export type IntegrationProxySelection = string | null;

export const buildIntegrationSocialUrl = (
  identifier: string,
  params: Record<string, string | null | undefined> = {}
) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string' && value.length > 0) {
      search.set(key, value);
    }
  });

  const query = search.toString();
  return `/integrations/social/${identifier}${query ? `?${query}` : ''}`;
};

export const useIntegrationProxies = () => {
  const fetch = useFetch();

  const load = useCallback(
    async (path: string): Promise<IntegrationProxyDto[]> => {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error('Could not load proxies');
      }

      return response.json();
    },
    []
  );

  return useSWR<IntegrationProxyDto[]>('/integrations/proxies', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const waitForNextFrame = () =>
  new Promise<void>((resolve) => {
    if (
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      resolve();
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });

const ProxyChoiceLoader = () => (
  <span className="h-[16px] w-[16px] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const ProxyLoadingSkeleton = () => (
  <div className="flex flex-col gap-[8px]">
    {[0, 1, 2].map((item) => (
      <div
        key={item}
        className="h-[46px] w-full animate-pulse rounded-[8px] border border-tableBorder bg-newTableHeader"
      >
        <div className="mx-[14px] mt-[16px] h-[12px] w-1/2 rounded-full bg-textColor/10" />
      </div>
    ))}
  </div>
);

export const IntegrationProxySelector: FC<{
  onContinue: (proxy: IntegrationProxySelection) => Promise<void> | void;
  instantContinue?: boolean;
  closeBeforeContinue?: boolean;
}> = ({
  onContinue,
  instantContinue = false,
  closeBeforeContinue = false,
}) => {
  const { data, error, isLoading } = useIntegrationProxies();
  const [selectedProxy, setSelectedProxy] =
    useState<IntegrationProxySelection>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [continuingProxy, setContinuingProxy] = useState<
    IntegrationProxySelection | undefined
  >(undefined);
  const [continueError, setContinueError] = useState<string | null>(null);
  const isContinuingRef = useRef(false);
  const modals = useModals();
  const t = useT();
  const proxies = data || [];
  const blocked = isLoading || !!error || isContinuing;

  const continueWithProxy = useCallback(
    async (proxy: IntegrationProxySelection) => {
      if (isContinuingRef.current || isLoading) {
        return;
      }

      if (error && (!instantContinue || proxy !== null)) {
        return;
      }

      isContinuingRef.current = true;
      setContinueError(null);
      setIsContinuing(true);
      setContinuingProxy(proxy);

      try {
        if (closeBeforeContinue) {
          await waitForNextFrame();
          modals.closeCurrent();
          await onContinue(proxy);
          return;
        }

        await onContinue(proxy);
        modals.closeCurrent();
      } catch (err) {
        if (!closeBeforeContinue) {
          setContinueError(
            err instanceof Error ? err.message : 'Could not continue'
          );
        }
      } finally {
        isContinuingRef.current = false;

        if (!closeBeforeContinue) {
          setIsContinuing(false);
          setContinuingProxy(undefined);
        }
      }
    },
    [
      closeBeforeContinue,
      error,
      instantContinue,
      isLoading,
      modals,
      onContinue,
    ]
  );

  if (instantContinue) {
    return (
      <div className="flex flex-col gap-[16px] pt-[4px]">
        {isLoading ? (
          <ProxyLoadingSkeleton />
        ) : error ? (
          <div className="text-[13px] text-red-400">
            {t('could_not_load_proxies', 'Could not load proxies')}
          </div>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {proxies.map((proxy) => {
              const isActive = continuingProxy === proxy.id;

              return (
                <button
                  type="button"
                  key={proxy.id}
                  disabled={isContinuing}
                  onClick={() => continueWithProxy(proxy.id)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-[12px] rounded-[8px] border px-[14px] py-[12px] text-start text-[14px] transition-colors',
                    isActive
                      ? 'border-primary bg-primary/10 text-textColor'
                      : 'border-tableBorder bg-newTableHeader text-textColor/80',
                    !isContinuing && !isActive && 'hover:bg-boxHover',
                    isContinuing && !isActive && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <span>{proxy.name}</span>
                  {isActive && isContinuing && <ProxyChoiceLoader />}
                </button>
              );
            })}
          </div>
        )}

        {!!continueError && (
          <div className="text-[13px] text-red-400">{continueError}</div>
        )}

        {!isLoading && (
          <Button
            type="button"
            secondary
            className="w-full rounded-[8px]"
            loading={isContinuing && continuingProxy === null}
            disabled={isContinuing}
            onClick={() => continueWithProxy(null)}
          >
            {t('continue_without_proxy', 'Continue without proxy')}
          </Button>
        )}
      </div>
    );
  }

  const continueSelectedProxy = () => {
    if (blocked) {
      return;
    }

    continueWithProxy(selectedProxy);
  };

  return (
    <div className="flex flex-col gap-[16px] pt-[4px]">
      <div className="flex flex-col gap-[8px]">
        <button
          type="button"
          onClick={() => setSelectedProxy(null)}
          className={clsx(
            'w-full rounded-[8px] border px-[14px] py-[12px] text-start text-[14px] transition-colors',
            selectedProxy === null
              ? 'border-primary bg-primary/10 text-textColor'
              : 'border-tableBorder bg-newTableHeader text-textColor/80 hover:bg-boxHover'
          )}
        >
          {t('no_proxy', 'No Proxy')}
        </button>

        {proxies.map((proxy) => (
          <button
            type="button"
            key={proxy.id}
            onClick={() => setSelectedProxy(proxy.id)}
            className={clsx(
              'w-full rounded-[8px] border px-[14px] py-[12px] text-start text-[14px] transition-colors',
              selectedProxy === proxy.id
                ? 'border-primary bg-primary/10 text-textColor'
                : 'border-tableBorder bg-newTableHeader text-textColor/80 hover:bg-boxHover'
            )}
          >
            {proxy.name}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-[13px] text-textColor/70">
          {t('loading_proxies', 'Loading proxies...')}
        </div>
      )}

      {!!error && (
        <div className="text-[13px] text-red-400">
          {t('could_not_load_proxies', 'Could not load proxies')}
        </div>
      )}

      {!!continueError && (
        <div className="text-[13px] text-red-400">{continueError}</div>
      )}

      <Button
        type="button"
        className="w-full rounded-[8px]"
        loading={isLoading || isContinuing}
        disabled={!!error || isLoading || isContinuing}
        onClick={continueSelectedProxy}
      >
        {t('continue', 'Continue')}
      </Button>
    </div>
  );
};
