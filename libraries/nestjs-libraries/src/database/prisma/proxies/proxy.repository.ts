import { IntegrationProxyDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.proxy.dto';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export type PostingProxy = {
  id: string;
  name: string;
  proxyParameter: string;
};

@Injectable()
export class ProxyRepository {
  constructor(private _proxy: PrismaRepository<'proxy'>) {}

  getIntegrationProxies(): Promise<IntegrationProxyDto[]> {
    return this._proxy.model.proxy.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  getProxyForPosting(proxyId: string): Promise<PostingProxy | null> {
    return this._proxy.model.proxy.findUnique({
      where: {
        id: proxyId,
      },
      select: {
        id: true,
        name: true,
        proxyParameter: true,
      },
    });
  }
}
