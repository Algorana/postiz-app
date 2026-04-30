# Решение: proxy в Integration и flow подключения соцсети

Источник: [`spec/update-integration-proxy.md`](../../spec/update-integration-proxy.md)

## Статус

Принято для текущей итерации спецификации.

## Цель

Добавить nullable поле `proxy` в модель `Integration` и дать пользователю возможность выбрать proxy до старта подключения соцсети. В этой итерации proxy только сохраняется и возвращается в API, но не применяется к OAuth, posting, refresh, analytics или другим provider-запросам.

## Ключевые решения

- `Integration.proxy` хранится как `String?`.
- Значение поля — id выбранного proxy или `null`, если интеграция подключена без proxy.
- Требуются обновление Prisma schema и DB migration с nullable column `proxy`; существующие записи должны получить `NULL`.
- Миграция должна быть оформлена как Prisma migration directory: `libraries/nestjs-libraries/src/database/prisma/migrations/<timestamp>_add_integration_proxy/migration.sql`.
- SQL миграции должен быть минимальным:

  ```sql
  ALTER TABLE "Integration" ADD COLUMN "proxy" TEXT;
  ```

- В текущей итерации для `proxy` нельзя добавлять индексы, foreign key, default value или `NOT NULL` constraint.
- Proxy выбирается до OAuth redirect и до существующего `inBetweenSteps` выбора страниц/каналов.
- Шаг выбора proxy применяется ко всем provider flow:
  - OAuth redirect;
  - `externalUrl`;
  - `customFields`;
  - Web3;
  - extension/cookie flow.
- Public/no-auth endpoint списка proxy возвращает контракт `{ id: string; name: string }[]`.
- В текущей итерации proxy-list endpoint всегда возвращает `[]`.
- `No Proxy` означает отсутствие query-param `proxy`; sentinel-значения вроде `no-proxy`, `null` или пустой строки отправлять нельзя.
- Выбранный proxy передаётся на старт flow через query-param `?proxy=<id>`.
- Backend сохраняет proxy в Redis по OAuth `state`.
- На callback backend восстанавливает proxy из Redis и передаёт его в создание или обновление `Integration`.
- Если Redis key потерян или proxy отсутствует, используется fallback `null`; flow подключения не должен ломаться.
- Backend в этой итерации не валидирует proxy id и не блокирует flow из-за неизвестного значения.
- При reconnect/refresh пользователь выбирает proxy заново, новое значение перезаписывает старое `Integration.proxy`.
- Reconnect scope включает все найденные user-driven entry points, а не только Add Channel: повторное подключение должно быть покрыто и в `apps/frontend/src/components/launches/launches.component.tsx`, и в `apps/frontend/src/components/platform-analytics/render.analytics.tsx`.
- User-driven reconnect/refresh стартует через `GET /integrations/social/:provider?refresh=<integrationInternalId>`; если пользователь выбрал `No Proxy`, query-param `proxy` не отправляется, а старое значение `Integration.proxy` должно очиститься через callback fallback `null`.
- `GET /integrations/list` должен возвращать поле `proxy`.

## UX требования

- После выбора provider показывается отдельный modal step:
  - title: `Select proxy`;
  - option: `No Proxy`;
  - button: `Continue`.
- Если proxy-list пустой, нужно показать только `No Proxy` и разрешить продолжить.
- Если proxy-list endpoint упал, подключение блокируется: пользователь не должен перейти к OAuth без успешной загрузки списка.
- При загрузке proxy-list пользователь не должен уйти дальше до завершения запроса.

## Ожидаемые области изменений

- Prisma schema: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`.
- DB migration для nullable column `proxy`.
- Repository/service слой интеграций в `libraries/nestjs-libraries` для сохранения и обновления proxy.
- Backend controllers интеграций для чтения query-param, сохранения в Redis, callback-восстановления и public proxy-list endpoint.
- Shared DTO/type `IntegrationProxyDto` с формой `{ id: string; name: string }`.
- Frontend Add Channel flow в `apps/frontend/src/components/launches/add.provider.component.tsx` и отдельный SWR hook для proxy-list.
- Frontend user-driven reconnect/refresh entry points:
  - `apps/frontend/src/components/launches/launches.component.tsx`;
  - `apps/frontend/src/components/platform-analytics/render.analytics.tsx`.

## Риски и компромиссы

- Public endpoint безопасен только пока возвращает пустой список; при появлении реального списка proxy нужно пересмотреть доступность endpoint и организационную фильтрацию.
- Отсутствие backend-валидации proxy id позволяет записать мусорное значение при ручной подстановке query-param.
- Fallback `null` при потере Redis key сохраняет устойчивость OAuth flow, но может потерять выбор пользователя.
- Для reconnect выбор `No Proxy` намеренно очищает ранее сохранённый `Integration.proxy`, потому что sentinel не отправляется, а callback получает fallback `null`.
- Реальное сетевое применение proxy отложено на будущую итерацию и должно быть описано отдельно.

## Связанные записи

- [Архитектурные решения](index.md)
- [Корень базы знаний](../root.md)
