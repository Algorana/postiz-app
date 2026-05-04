# Спецификация: проксирование OAuth/auth flow для TikTok и Instagram Standalone

## 1. Цель

Реализовать использование выбранного пользователем proxy не только при публикации, но и на этапе server-side аутентификации социальных интеграций.

Текущий scope задачи ограничен двумя provider identifiers:

- `tiktok`
- `instagram-standalone`

Обычный Instagram через Facebook Business (`instagram`) и остальные providers в рамках этой задачи не изменяются.

## 2. Исходный контекст

В проекте уже реализован выбор proxy перед OAuth:

- пользователь выбирает proxy в modal перед авторизацией;
- если выбран `No Proxy`, query-param `proxy` не отправляется;
- если proxy выбран, frontend передаёт `?proxy=<id>`;
- backend сохраняет выбранный proxy id в Redis по ключу `proxy:<state>`;
- callback читает `selectedProxy` из Redis;
- при успешном создании integration значение сохраняется в `Integration.proxy`.

Также уже существует инфраструктура HTTP-запросов через proxy:

- `ProxyHttpService`
- `CustomAxiosClient`
- `ProxyUnavailableError`

`ProxyHttpService` уже умеет:

- резолвить proxy id в `proxyParameter`;
- не раскрывать `proxyParameter` наружу;
- использовать proxy agent;
- работать без proxy при `proxyId = null`;
- fail-closed при выбранном, но недоступном/невалидном proxy.

## 3. Функциональные требования

### 3.1. Какие auth-запросы должны проксироваться

Если пользователь выбрал proxy перед подключением `tiktok` или `instagram-standalone`, через выбранный proxy должны идти все server-side HTTP-запросы auth lifecycle:

#### TikTok

В `TiktokProvider` должны использовать proxy:

- `authenticate()`:
  - `POST https://open.tiktokapis.com/v2/oauth/token/`
  - `GET https://open.tiktokapis.com/v2/user/info/...`
- `refreshToken()`:
  - `POST https://open.tiktokapis.com/v2/oauth/token/`
  - `GET https://open.tiktokapis.com/v2/user/info/...`

#### Instagram Standalone

В `InstagramStandaloneProvider` должны использовать proxy:

- `authenticate()`:
  - `POST https://api.instagram.com/oauth/access_token`
  - `GET https://graph.instagram.com/access_token?...`
  - `GET https://graph.instagram.com/v21.0/me?...`
- `refreshToken()`:
  - `GET https://graph.instagram.com/refresh_access_token?...`
  - `GET https://graph.instagram.com/v21.0/me?...`

### 3.2. Что не проксируется

Не требуется и невозможно проксировать browser-side OAuth redirect/navigation:

- переход пользователя на `https://www.tiktok.com/v2/auth/authorize/...`;
- переход пользователя на `https://www.instagram.com/oauth/authorize?...`.

Proxy применяется только к backend server-side запросам к provider API.

### 3.3. Поведение при отсутствии proxy

Если proxy не выбран (`selectedProxy = null`), auth и refresh должны работать как раньше.

При этом реализация должна использовать единый путь через:

```ts
ProxyHttpService.fetch(url, options, null)
```

Это нужно для единообразия кода и чтобы избежать двух разных HTTP-механизмов в auth flow.

### 3.4. Fail-closed поведение

Если proxy выбран, но на callback/auth/refresh он:

- не найден в БД;
- невалиден;
- недоступен;
- не может быть применён к HTTP-запросу;

операция должна завершиться ошибкой.

Запрещено:

- выполнять direct fallback без proxy;
- silently создавать integration без proxy;
- очищать `Integration.proxy` из-за auth/refresh ошибки;
- скрыто продолжать OAuth напрямую после proxy failure.

### 3.5. Валидация proxy id

До redirect на TikTok/Instagram proxy id валидировать не нужно.

Причина: текущий flow уже сохраняет выбранное значение в Redis, а реальная проверка должна происходить непосредственно перед server-side запросом через `ProxyHttpService`.

Если proxy был выбран, но удалён или изменён между стартом OAuth и callback, callback должен завершиться ошибкой `proxy unavailable` через существующий error flow.

### 3.6. Refresh lifecycle

Refresh token для `tiktok` и `instagram-standalone` считается частью auth lifecycle и должен использовать proxy из `Integration.proxy`.

При успешном refresh поле `Integration.proxy` должно сохранять прежнее значение.

При ошибке proxy during background refresh поведение остаётся жёстким, как текущая логика refresh failure:

- пометить integration как требующую refresh/reconnect;
- отправить notification;
- выполнить disconnect channel согласно текущему `RefreshIntegrationService` flow.

## 4. Архитектурные требования

### 4.1. Подход к передаче proxy в provider methods

Выбран локальный подход без масштабного рефакторинга всех providers.

Нужно расширить параметры только там, где это необходимо для `tiktok` и `instagram-standalone`:

- `authenticate(params, clientInformation?)` должен получить возможность принять optional proxy context;
- `refreshToken(refreshToken)` должен получить возможность принять optional proxy context или отдельный optional параметр.

Рекомендуемый минимальный контракт:

```ts
type AuthProxyContext = {
  proxyId?: string | null;
  proxyHttpService?: ProxyHttpService;
};
```

И использовать его локально в нужных providers.

Важно: изменение не должно требовать переписывания всех provider implementations.

### 4.2. Использование существующего ProxyHttpService

Новый auth-specific сервис создавать не нужно.

Все auth/refresh HTTP-запросы в scope должны идти через существующий:

```ts
ProxyHttpService.fetch(url, options, proxyId)
```

Для `proxyId = null` сервис должен выполнить обычный запрос без proxy.

Для непустого `proxyId` сервис обязан:

- зарезолвить proxy через `ProxyService`;
- применить `proxyParameter`;
- при проблеме бросить `ProxyUnavailableError`;
- не раскрывать `proxyParameter` и credentials.

### 4.3. Изменения callback flow

В `NoAuthIntegrationsController.connectSocialMedia()` уже читается:

```ts
const selectedProxy = (await ioRedis.get(`proxy:${body.state}`)) ?? null;
```

Нужно прокинуть `selectedProxy` и `ProxyHttpService` в `integrationProvider.authenticate(...)` для providers из scope.

Если `ProxyUnavailableError` возникает в `authenticate()`, его нужно преобразовать в явную пользовательскую ошибку через существующий error flow, а не в generic `Authentication failed`.

Например сообщение уровня пользователя:

```text
Authentication failed because the selected proxy is unavailable. Please choose another proxy or No Proxy and reconnect.
```

Формулировку можно адаптировать под существующие тексты приложения, но причина proxy должна быть явной.

### 4.4. Изменения refresh flow

В местах refresh нужно передавать `integration.proxy` в `provider.refreshToken(...)` для providers из scope.

Актуальные места, которые нужно проверить и изменить:

- `libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts`
- `libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts`

При обновлении integration после успешного refresh нужно сохранить прежний proxy. Нельзя случайно обнулить `Integration.proxy`.

### 4.5. Ограничение по providers

Новая логика применяется строго к identifiers:

```ts
['tiktok', 'instagram-standalone']
```

Остальные providers не должны менять поведение.

## 5. UI/UX требования

### 5.1. UI выбора proxy

UI modal выбора proxy уже реализован и в рамках этой задачи не меняется.

Не требуется:

- менять modal;
- добавлять retry UX;
- добавлять новый экран выбора proxy;
- менять список proxy.

### 5.2. Ошибка callback/auth

Если OAuth callback не завершился из-за proxy, пользователь должен попасть в существующий error flow интеграций.

Отличие от текущего поведения: ошибка должна быть proxy-specific, а не generic `Authentication failed`.

### 5.3. Ошибка refresh

Если background refresh не удался из-за proxy, пользователь должен получить notification через существующий refresh failure mechanism.

Текст должен явно указывать, что причиной может быть выбранный proxy.

## 6. Безопасность и логирование

### 6.1. Запрещено логировать

Нельзя логировать:

- `Proxy.proxyParameter`;
- proxy credentials;
- OAuth `code`;
- access token;
- refresh token;
- client secret;
- полный URL с query, если в query есть token/secret/code.

### 6.2. Допустимо логировать

Допустимо логировать только безопасный контекст:

- proxy id;
- proxy name;
- provider identifier;
- operation (`authenticate`, `refreshToken`, `tokenExchange`, `profileInfo`);
- HTTP method;
- HTTP status;
- target host/path без sensitive query parameters.

Текущий `ProxyHttpService` уже логирует `proxyId`, `proxyName`, method и origin. Если потребуется расширять логирование для auth, делать это только безопасным способом.

## 7. Риски и компромиссы

### 7.1. Риск: OAuth redirect не проксируется

Пользовательский переход в браузере на TikTok/Instagram не может быть проксирован backend proxy.

Решение: явно считать proxy применимым только к server-side token/profile/refresh requests.

### 7.2. Риск: proxy исчез между start и callback

Пользователь может выбрать proxy, пройти OAuth у provider, но к моменту callback proxy будет удалён.

Решение: callback fail-closed с явной proxy unavailable ошибкой. Integration не создаётся.

### 7.3. Риск: временный proxy outage отключит канал при refresh

Согласованное поведение: оставляем текущую жёсткую refresh failure semantics — refresh failure ведёт к disconnect flow.

Компромисс: это снижает устойчивость к временным proxy сбоям, но соответствует текущей модели безопасности и fail-closed политике.

### 7.4. Риск: случайное обнуление Integration.proxy при refresh

При успешном refresh необходимо сохранить прежний proxy. Реализация должна проверить `createOrUpdateIntegration`/repository behavior и явно передать proxy при необходимости.

### 7.5. Риск: generic catch скрывает proxy failure

В callback сейчас многие ошибки превращаются в `Authentication failed`.

Решение: `ProxyUnavailableError` должен обрабатываться отдельно и возвращать proxy-specific message.

## 8. Проверка реализации

Автоматические тесты в рамках задачи не обязательны.

Минимально ожидаемая ручная проверка:

1. TikTok + `No Proxy`:
   - OAuth завершается как раньше;
   - integration создаётся с `proxy = null`.
2. TikTok + валидный proxy:
   - token exchange и user info идут через `ProxyHttpService`;
   - integration создаётся с выбранным proxy id.
3. TikTok + несуществующий proxy id:
   - direct fallback не происходит;
   - integration не создаётся;
   - пользователь видит proxy-specific error.
4. Instagram standalone + `No Proxy`:
   - OAuth завершается как раньше.
5. Instagram standalone + валидный proxy:
   - short-lived token exchange, long-lived token exchange и profile info идут через proxy.
6. Instagram standalone + missing proxy:
   - OAuth fail-closed.
7. Refresh для integration с proxy:
   - refresh-запросы идут через proxy;
   - после успешного refresh `Integration.proxy` сохраняется.
8. Refresh для integration с недоступным proxy:
   - direct fallback не происходит;
   - срабатывает текущий refresh failure/disconnect flow.

## 9. Планируемые изменения по файлам и модулям

Ожидаемые затронутые файлы:

- `apps/backend/src/api/routes/no.auth.integrations.controller.ts`
  - внедрить/передать `ProxyHttpService`;
  - прокинуть `selectedProxy` в `authenticate()`;
  - отдельно обработать `ProxyUnavailableError` и вернуть proxy-specific error через существующий flow.

- `libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts`
  - добавить optional auth proxy context в контракт `authenticate`/`refreshToken` без обязательного изменения всех providers.

- `libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts`
  - заменить direct `fetch` в `authenticate()` и `refreshToken()` на `ProxyHttpService.fetch`;
  - использовать `proxyId` из optional context.

- `libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider.ts`
  - заменить direct `fetch` в `authenticate()` и `refreshToken()` на `ProxyHttpService.fetch`;
  - использовать `proxyId` из optional context.

- `libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts`
  - передавать proxy context в refresh для scoped providers;
  - гарантировать сохранение прежнего `Integration.proxy` после успешного refresh.

- `libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts`
  - передавать `integration.proxy` и `ProxyHttpService` в refresh для scoped providers;
  - сохранить текущую failure semantics при proxy error.

- `libraries/nestjs-libraries/src/http/proxy.errors.ts`
  - при необходимости уточнить user-facing текст `ProxyUnavailableError`, не ломая posting flow.

- `libraries/nestjs-libraries/src/http/proxy.http.service.ts`
  - по возможности переиспользовать без изменений;
  - если расширять логирование, не раскрывать secrets/query tokens.

Фронтенд-файлы выбора proxy менять не требуется.
