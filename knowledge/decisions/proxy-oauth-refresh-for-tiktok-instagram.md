# Решение: proxy для server-side OAuth/auth и refresh TikTok/Instagram Standalone

Источник: [`spec/proxy-update.md`](../../spec/proxy-update.md)

## Статус

Реализовано и проверено. Основная реализация зафиксирована в HEAD commit `136e6299`.

## Контекст

В предыдущем flow proxy уже выбирается в UI modal и сохраняется по OAuth `state`, см. [решение о proxy в Integration](integration-proxy-flow.md). Новая задача — начать применять выбранный proxy к server-side auth-запросам provider identifiers `tiktok` и `instagram-standalone`.

## Ключевые решения

- Все server-side auth-запросы providers `tiktok` и `instagram-standalone` должны выполняться через единый путь `ProxyHttpService.fetch(url, options, proxyId | null)`.
- Через `ProxyHttpService.fetch` должны проходить:
  - OAuth token exchange;
  - profile/user info;
  - `refreshToken`.
- Browser redirect не проксируется: пользовательский переход в OAuth provider остаётся обычным browser redirect.
- Если proxy выбран, но на callback или refresh он недоступен, не найден или невалиден, поведение должно быть fail closed:
  - direct fallback запрещён;
  - integration не создаётся при auth/callback failure;
  - пользователю возвращается явная proxy-specific ошибка через существующий error flow.
- Если proxy отсутствует (`null`), flow всё равно должен идти через `ProxyHttpService.fetch(..., null)`, но без сетевого proxy.
- До browser redirect proxy id не валидируется. Валидация и фактическая проверка происходят на callback и refresh.
- Refresh должен использовать сохранённое значение `Integration.proxy`.
- Refresh flow передаёт `integration.proxy ?? null` в `provider.refreshToken`.
- После успешного refresh proxy не передаётся обратно в `createOrUpdateIntegration`, чтобы не перезаписать конкурентную смену proxy stale значением; repository сохраняет proxy при `undefined`.
- При proxy failure во время refresh нужно сохранить текущую жёсткую refresh failure semantics: integration отключается/disconnect происходит как при существующей ошибке refresh.
- UI выбора proxy в рамках этой задачи не меняется.
- Отсутствие Redis key `proxy:<state>` трактуется как сценарий `No Proxy`; sentinel-значение для явного `No Proxy` не добавлялось.

## Реализованное поведение

- В contract provider добавлен `AuthProxyContext`.
- Callback передаёт `selectedProxy` и `ProxyHttpService` только scoped providers.
- Для `tiktok` и `instagram-standalone` server-side HTTP операции token exchange, profile/auth и refresh выполняются через `ProxyHttpService.fetch`.
- Browser redirect не проксируется и остаётся обычным переходом пользователя в OAuth provider.
- `ProxyUnavailableError` маппится в proxy-specific auth error, чтобы пользователь видел явную proxy-причину failure.

## Логирование и безопасность

Разрешено логировать только:

- proxy id;
- proxy name;
- provider;
- operation;
- HTTP status;
- host/path.

Запрещено логировать:

- `proxyParameter`;
- proxy credentials;
- OAuth code;
- access/refresh tokens;
- client secrets и другие secrets.

## Ожидаемые области изменений

- `apps/backend/src/api/routes/no-auth/no.auth.integrations.controller.ts` — callback/auth error flow и передача proxy в provider auth path.
- `libraries/nestjs-libraries/src/integrations/social.integrations.interface.ts` — контракт provider methods для передачи proxy id в auth/refresh операции.
- `libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts` — token exchange, user info и refresh через `ProxyHttpService.fetch`.
- `libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider.ts` — token exchange, user info и refresh через `ProxyHttpService.fetch`.
- `libraries/nestjs-libraries/src/integrations/integration.service.ts` — создание/обновление integration с учётом proxy failure semantics.
- `libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts` — refresh через `Integration.proxy`, сохранение proxy после успеха и disconnect при proxy failure.
- Возможно: `proxy.errors.ts` и `proxy.http.service.ts` — явные proxy-specific ошибки, нормализация fail closed и безопасное логирование.

## Риски и компромиссы

- Fail closed намеренно ухудшает доступность при выбранном proxy, но защищает от незаметного обхода пользовательского выбора через direct fallback.
- Отложенная валидация proxy до callback/refresh оставляет прежний UX старта OAuth и не блокирует redirect, но ошибка возникает позже — её нужно сделать явно proxy-specific.
- Refresh сохраняет существующую жёсткую semantics disconnect при ошибке, даже если причина связана с proxy, чтобы не вводить отдельное частично-подключённое состояние.
- Единый path через `ProxyHttpService.fetch(..., null)` для no-proxy сценария уменьшает расхождения между proxy и direct flow.

## Результат validation

Проверено на стадии Validation/Report после реализации основной feature в HEAD commit `136e6299`.

- `pnpm --filter ./apps/backend run build` — PASS.
- `git diff --check` — PASS.
- Review: architecture/security/performance — PASS.
- Текущий diff на стадии Report: `knowledge/decisions/proxy-oauth-refresh-for-tiktok-instagram.md` и `libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts`.
- Ошибка TypeScript `TS2339`, найденная пользователем в backend build, больше не воспроизводится.

Дополнительный fix в `libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts`: проверка результата refresh изменена с `if (!data)` на `if (!data || typeof data !== 'object')`. Причина: результат refresh имеет тип `true | { refreshToken; accessToken; expiresIn }`; non-object successful/legacy result должен считаться failure для дальнейшего обновления токенов и не должен деструктурироваться.

Важное подтверждённое решение: при successful refresh proxy не передаётся обратно в `createOrUpdateIntegration`, чтобы не перезаписать конкурентно изменённый `Integration.proxy`. Repository должен сохранить текущий proxy, если значение proxy при обновлении равно `undefined`.

Важное подтверждённое решение: отсутствие Redis key `proxy:<state>` означает `No Proxy`. Отдельный sentinel не добавлялся, чтобы не усложнять state lifecycle и сохранить совместимость с отсутствующим/истёкшим ключом.

## Связанные записи

- [Архитектурные решения](index.md)
- [Добавление proxy в модель Integration и flow подключения соцсети](integration-proxy-flow.md)
- [Кастомный server-side HTTP-клиент с proxy для posting flow](add-custom-axios-proxy-client.md)
- [Корень базы знаний](../root.md)
