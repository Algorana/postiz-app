# Решение: кастомный server-side HTTP-клиент с proxy для posting flow

Источник: [`spec/add-custom-axios.md`](../../spec/add-custom-axios.md)

## Статус

Принято для текущей итерации спецификации.

## Цель

Создать кастомный server-side axios-like HTTP-клиент с поддержкой применения proxy через proxy id. В текущей итерации замена `fetch` на новый клиент и подключение proxy выполняются только для ручки/пути публикации.

Сам клиент при этом проектируется универсальным: он должен быть готов принимать другие типы server-side HTTP-запросов в будущих итерациях — OAuth, refresh, analytics, webhooks, short-linking и другие сценарии. Подключение этих сценариев сейчас не входит в scope.

## Ключевые решения

- Новый HTTP-клиент и proxy-resolving service должны находиться в `libraries/nestjs-libraries`, потому что posting/provider-код расположен в shared libraries.
- Низкоуровневый HTTP-клиент должен оставаться универсальным axios-like клиентом, а не одноразовой реализацией только под публикацию.
- Proxy-aware service подключается только там, где публикация выполняет прямые HTTP-запросы через `fetch` или новый клиент.
- Proxy применяется только к внешним social/provider API-запросам во время posting.
- HTTP-загрузки исходных медиа из Postiz storage/CDN/media-source URL в этой итерации не проксируются.
- Разрешено добавить root dependency `https-proxy-agent`.
- Добавляется Prisma-модель `Proxy`:
  - `id` — `uuid`;
  - `name` — `string`;
  - `proxyParameter` — `string`;
  - `createdAt`;
  - `updatedAt`.
- `Integration.proxy` остаётся nullable string, без foreign key, и трактуется как id proxy.
- Endpoint `GET /integrations/proxies` уже существует и должен продолжить возвращать контракт `{ id, name }[]`, но теперь данные берутся из таблицы `Proxy`.
- `proxyParameter` нельзя возвращать из `GET /integrations/proxies`.
- CRUD/UI управления proxy не входит в задачу.

## Поведение при posting

- Proxy id валидируется при posting.
- `Integration.proxy` передаётся в proxy-aware HTTP-сервис только в тех участках ручки/пути публикации, где выполняются прямые HTTP-запросы через `fetch` или новый клиент.
- Если `Integration.proxy` задан, но proxy не найден, невалиден или недоступен, публикация должна завершиться ошибкой по принципу fail closed.
- При ошибке proxy запрещён fallback на прямой запрос без proxy.
- Если у интеграции выбран proxy, а конкретный posting provider публикует через SDK или специализированный клиент, для которого proxy нельзя гарантированно применить, публикация должна завершиться safe-ошибкой по принципу fail closed.
- Скрытая публикация напрямую в обход выбранного proxy запрещена, даже если SDK/специализированный клиент технически может выполнить запрос без proxy.
- Пользователь получает общий безопасный текст ошибки без раскрытия технических деталей proxy.
- В логах нельзя раскрывать полный proxy URL или credentials.
- В логах допустимо использовать только безопасные идентификаторы proxy: `id` и/или `name`.

## Уточнение scope миграции HTTP-вызовов

- В этой итерации `fetch` меняется на новый axios-like клиент только для ручки/пути публикации.
- Не нужно массово менять все `fetch` в `apps/backend`, `libraries/nestjs-libraries`, `apps/orchestrator` или `apps/frontend`.
- Даже внутри backend/shared-кода менять нужно только те `fetch`, которые относятся к выполнению публикации.
- Внутри posting flow проксируются только внешние social/provider API-запросы; загрузки исходных медиа из Postiz storage/CDN/media-source URL остаются без proxy.
- Не нужно массово менять все существующие прямые `axios`-вызовы.
- Будущие server-side сценарии (`OAuth`, `refresh`, `analytics`, `webhooks`, `short-linking` и т.д.) должны иметь возможность использовать этот клиент позже, но их подключение сейчас не выполняется.
- SDK-запросы остаются вне scope и не переводятся на новый клиент; если при выбранном proxy provider зависит от такого SDK/специализированного клиента и proxy нельзя гарантировать, публикация должна fail closed.

## Ограничения scope

В текущую итерацию не входят:

- SDK-запросы через `googleapis`, `gaxios` и аналоги;
- проксирование HTTP-загрузок исходных медиа из Postiz storage/CDN/media-source URL;
- proxy для OAuth/authenticate/reconnect/refresh/analytics;
- proxy для frontend fetch;
- массовая миграция всех server-side fetch на новый клиент;
- массовая миграция всех `fetch` в `apps/backend`, `libraries/nestjs-libraries`, `apps/orchestrator` или `apps/frontend`;
- массовая миграция существующих прямых `axios`-вызовов;
- foreign key для `Integration.proxy`;
- encryption at rest для `Proxy.proxyParameter`;
- CRUD/UI управления proxy.

## Риски и компромиссы

- Покрытие provider-ов будет частичным, потому что SDK-запросы (`googleapis`, `gaxios` и аналоги) в этой итерации не трогаются.
- Provider-ы, которые публикуют только через SDK/специализированные клиенты без гарантированной proxy-поддержки, при выбранном proxy должны отказывать в публикации safe-ошибкой; это может временно уменьшить число поддерживаемых proxy-aware публикаций.
- Исключение media-source загрузок из proxy scope снижает риск поломки внутренних/контролируемых Postiz загрузок, но требует аккуратно отделять загрузку медиа от внешних social/provider API-вызовов.
- `Proxy.proxyParameter` хранит полный proxy URL с credentials; это повышает требования к логированию и доступу к базе.
- Fail closed снижает успешность публикаций при проблемах proxy, но предотвращает нежелательный обход proxy прямым соединением.
- Отсутствие FK позволяет сохранить невалидный id в `Integration.proxy`; ошибка обнаружится только при posting.

## Связанные записи

- [Proxy в Integration и flow подключения соцсети](integration-proxy-flow.md)
- [Архитектурные решения](index.md)
- [Корень базы знаний](../root.md)
