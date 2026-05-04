'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { IntegrationProxyDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.proxy.dto';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';
import { FC, useCallback, useState } from 'react';
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

export const IntegrationProxySelector: FC<{
  onContinue: (proxy: IntegrationProxySelection) => Promise<void> | void;
}> = ({ onContinue }) => {
  const { data, error, isLoading } = useIntegrationProxies();
  const [selectedProxy, setSelectedProxy] =
    useState<IntegrationProxySelection>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const modals = useModals();
  const t = useT();
  const proxies = data || [];
  const blocked = isLoading || !!error || isContinuing;

  const continueWithProxy = useCallback(async () => {
    if (blocked) {
      return;
    }

    setContinueError(null);
    setIsContinuing(true);

    try {
      await onContinue(selectedProxy);
      modals.closeCurrent();
    } catch (err) {
      setContinueError(
        err instanceof Error ? err.message : 'Could not continue'
      );
    } finally {
      setIsContinuing(false);
    }
  }, [blocked, modals, onContinue, selectedProxy]);

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
        onClick={continueWithProxy}
      >
        {t('continue', 'Continue')}
      </Button>
    </div>
  );
};
