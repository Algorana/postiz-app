import { IntegrationProxyDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.proxy.dto';
import {
  PostingProxy,
  ProxyRepository,
} from '@gitroom/nestjs-libraries/database/prisma/proxies/proxy.repository';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProxyService {
  constructor(private _proxyRepository: ProxyRepository) {}

  getIntegrationProxies(): Promise<IntegrationProxyDto[]> {
    return this._proxyRepository.getIntegrationProxies();
  }

  getProxyForPosting(proxyId: string): Promise<PostingProxy | null> {
    return this._proxyRepository.getProxyForPosting(proxyId);
  }
}
