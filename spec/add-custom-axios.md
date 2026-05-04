# Спецификация: кастомный axios-клиент с поддержкой proxy для posting

## 1. Цель задачи

Создать единый server-side HTTP-клиент на базе `axios`, который позволит выполнять HTTP-запросы через proxy, если вызывающий код передал `proxy id`. В рамках текущей итерации замена `fetch` на новый axios-клиент выполняется только для ручки/пути публикации.

Сам клиент при этом должен быть универсальным и готовым для будущего использования в других типах запросов: OAuth, refresh, analytics, webhooks, short-linking и любых других server-side HTTP-вызовах.

Дополнительно нужно создать таблицу proxy и подключить существующий endpoint списка proxy, чтобы форма добавления интеграции могла получать список доступных proxy в текущем формате `{ id, name }`.

## 2. Текущий контекст

- В проекте уже есть поле `Integration.proxy: String?` в Prisma-модели `Integration`.
- При старте добавления интеграции выбранный proxy сохраняется во временный Redis key `proxy:{state}`.
- На callback/social-connect proxy из Redis сохраняется в `Integration.proxy`.
- Сейчас proxy только хранится и возвращается в списке интеграций, но не применяется к реальным provider-запросам.
- Уже существует endpoint `GET /integrations/proxies` в `NoAuthIntegrationsController`, но он возвращает пустой массив.
- DTO списка proxy уже существует: `IntegrationProxyDto = { id: string; name: string }`.
- Прямые HTTP-вызовы сейчас разбросаны между `axios`, `fetch`, provider-кодом и SDK. SDK в этой итерации не трогаются.

## 3. Основные решения

### 3.1. Где применяется proxy и axios-клиент

В текущей итерации proxy и новый axios-клиент применяются только в ручке/пути публикации.

При этом сам HTTP-клиент должен быть универсальным: любой будущий вызов сможет использовать его и, при необходимости, proxy, если передаст `proxy id` в сервис-обёртку.

### 3.2. Что считается posting scope

Цель текущей итерации — подключить новый axios-клиент к ручке/пути публикации и тем участкам posting/provider-кода, которые непосредственно выполняются при публикации.

Так как posting logic в Postiz находится не только в `apps/backend`, но и в `libraries/nestjs-libraries/src/integrations/social/*`, scope может затрагивать posting-related код в `libraries/nestjs-libraries`, но только в пределах выполнения публикации.

Общая миграция всех server-side `fetch` по всему monorepo не является целью этой итерации. Даже внутри backend/shared-кода менять нужно только те `fetch`, которые относятся к ручке/пути публикации.

### 3.3. SDK не трогаются

Provider-ы или участки, которые используют SDK/специализированные клиенты вместо прямого `axios`/`fetch`, в этой итерации не переводятся на новый клиент.

Если posting provider частично использует SDK, это должно быть явно зафиксировано как ограничение конкретной реализации.

Уточнение по fail-closed: если у интеграции выбран proxy, а конкретный posting provider публикует через SDK/специализированный клиент и в рамках этой итерации не может гарантированно выполнить публикацию через proxy, публикация должна завершиться safe-ошибкой. Скрытая публикация напрямую при выбранном proxy запрещена.

### 3.3.1. Граница social API и media source downloads

Proxy в рамках этой итерации применяется к внешним social/provider API-запросам, выполняемым во время posting.

HTTP-загрузки исходных медиа из Postiz storage/CDN или других media-source URL перед отправкой в соцсеть не проксируются в этой итерации, если это не является непосредственным запросом к social/provider API.

### 3.4. Поведение при ошибке proxy

Выбрана стратегия `fail closed`:

- если у интеграции выбран proxy;
- но proxy id не найден в таблице;
- или proxy URL невалиден;
- или соединение через proxy падает;

то posting-запрос должен завершиться ошибкой. Автоматический fallback на прямое соединение запрещён.

Пользователь должен видеть общий safe-message без раскрытия proxy URL и credentials.

## 4. Модель данных

### 4.1. Новая Prisma-модель

Добавить новую модель `Proxy`:

```prisma
model Proxy {
  id             String   @id @default(uuid())
  name           String
  proxyParameter String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### 4.2. Поле `proxyParameter`

`proxyParameter` хранит полный proxy URL, например:

```txt
http://myuser:mypassword@5.8.19.79:3128
```

В этой итерации URL хранится одной строкой, без разнесения protocol/host/port/login/password по отдельным колонкам.

### 4.3. Связь с `Integration`

Поле `Integration.proxy` остаётся nullable string.

Не нужно добавлять foreign key relation на `Proxy`. Валидация выбранного proxy id выполняется при posting.

## 5. API списка proxy

### 5.1. Endpoint

Существующий endpoint остаётся без изменения URL и контракта:

```http
GET /integrations/proxies
```

Текущее поведение `return []` нужно заменить на чтение из новой таблицы `Proxy`.

### 5.2. Response contract

Endpoint возвращает только публичные поля:

```ts
type IntegrationProxyDto = {
  id: string;
  name: string;
};
```

`proxyParameter` никогда не должен возвращаться на frontend.

### 5.3. CRUD proxy

CRUD/API для управления proxy в этой задаче не требуется.

Proxy записи создаются вне приложения: вручную в БД, отдельным seed/admin-механизмом или будущей задачей.

## 6. Архитектура HTTP-клиента

### 6.1. Расположение

Кастомный axios-клиент и proxy-resolving service должны находиться в:

```txt
libraries/nestjs-libraries
```

Причина: posting/provider-код живёт в shared server library и должен иметь доступ к клиенту без привязки только к `apps/backend`.

### 6.2. Зависимость

Разрешено добавить root dependency:

```txt
https-proxy-agent
```

Добавление зависимости должно выполняться через `pnpm`, так как проект использует только PNPM.

### 6.3. Слои

Нужны два уровня:

1. Низкоуровневый axios-like клиент.
2. Сервис-обёртка, который по `proxy id` резолвит `proxyParameter` из БД и передаёт готовый proxy URL/agent в низкоуровневый клиент.

Низкоуровневый клиент не должен сам напрямую ходить в БД.

### 6.4. Контракт клиента

Клиент должен быть похож на `axios`, чтобы было проще заменить существующие вызовы:

```ts
httpClient.request(config)
httpClient.get(url, config?)
httpClient.post(url, data?, config?)
httpClient.put(url, data?, config?)
httpClient.patch(url, data?, config?)
httpClient.delete(url, config?)
```

Proxy-aware сервис-обёртка должен позволять передать `proxyId?: string | null`.

Пример ожидаемой идеи контракта:

```ts
proxyHttpService.request({
  proxyId: integration.proxy,
  config: {
    method: 'POST',
    url,
    data,
    headers,
  },
});
```

Или axios-like методы:

```ts
proxyHttpService.post(url, body, {
  headers,
  proxyId: integration.proxy,
});
```

Финальный API можно выбрать во время реализации, но он обязан сохранить axios-like удобство и не смешивать резолв БД с низкоуровневым HTTP transport.

### 6.5. Поведение без proxy

Если `proxyId` равен `null` или `undefined`, запрос выполняется как обычный axios-запрос без proxy agent.

### 6.6. Поведение с proxy

Если `proxyId` передан:

1. Proxy-resolving service ищет запись `Proxy` по id.
2. Если запись не найдена — запрос падает с safe ошибкой.
3. Если запись найдена — из `proxyParameter` создаётся `HttpsProxyAgent`.
4. Axios-запрос выполняется с соответствующим `httpAgent`/`httpsAgent` и отключённым стандартным axios proxy config при необходимости.
5. При любой ошибке proxy fallback напрямую запрещён.

## 7. Posting flow

### 7.1. Использование `Integration.proxy`

Ручка/путь публикации должен получать `Integration.proxy` и передавать его в proxy-aware HTTP-сервис там, где при публикации выполняются прямые HTTP-запросы через `fetch`.

`Integration.proxy` трактуется как id записи в таблице `Proxy`.

### 7.2. Валидация proxy id

Валидация выполняется при posting:

- если `Integration.proxy` пустой — posting идёт напрямую;
- если `Integration.proxy` задан, но записи `Proxy` нет — posting падает;
- если запись есть, но proxy недоступен — posting падает;
- fallback на прямой запрос запрещён.

### 7.3. Миграция `fetch` на axios в этой итерации

В этой итерации нужно заменить `fetch` на новый axios-клиент только для ручки/пути публикации.

Не нужно массово заменять:

- все `fetch` во frontend;
- все `fetch` в `apps/backend`;
- все `fetch` в `libraries/nestjs-libraries`;
- все `fetch` в `apps/orchestrator`;
- все существующие прямые `axios`-вызовы, если они не требуют изменения для публикации.

Новый клиент должен быть готов принимать и другие запросы, но подключение этих запросов к клиенту является будущим расширением.

## 8. Безопасность и логирование

### 8.1. Не раскрывать credentials

`proxyParameter` может содержать логин и пароль. Его нельзя возвращать на frontend и нельзя писать в пользовательские ошибки.

### 8.2. Маскирование логов

Если в логах или internal error context нужно упомянуть proxy, разрешено логировать только:

- proxy id;
- proxy name.

Полный URL и credentials должны быть замаскированы.

### 8.3. Пользовательская ошибка

При ошибке proxy пользователь должен видеть общий safe-message, например:

```txt
Posting failed because the selected proxy is unavailable.
```

Точный текст можно адаптировать под существующую систему ошибок Postiz, но без раскрытия proxy URL, host, login или password.

## 9. Out of scope

В текущую задачу не входит:

- CRUD/UI для управления proxy.
- Организационная/tenant-фильтрация proxy.
- Перевод frontend `fetch` на axios.
- Массовая миграция всех server-side `fetch` по всему monorepo.
- Массовая миграция всех `fetch` в `apps/backend`; в этой итерации меняется только ручка/путь публикации.
- Массовая миграция всех существующих прямых `axios`-вызовов.
- Поддержка proxy для OAuth/authenticate/reconnect/refresh/analytics.
- Проксирование SDK-запросов (`googleapis`, `gaxios` и аналогичные).
- Foreign key между `Integration.proxy` и `Proxy.id`.
- Шифрование `proxyParameter` at-rest.
- Специальные unit/integration тесты в рамках этой спецификации.

## 10. Риски и компромиссы

### 10.1. Частичное покрытие provider-ов

Так как в этой итерации меняется только ручка/путь публикации и SDK не трогаются, часть provider-запросов может не проходить через новый клиент. Это нужно явно учитывать при реализации и не заявлять полную поддержку proxy за пределами публикации.

### 10.2. Хранение полного proxy URL

Хранение `proxyParameter` одной строкой ускоряет реализацию, но несёт риски:

- credentials находятся в одном поле;
- сложнее валидировать protocol/host/port;
- сложнее безопасно ротировать password;
- выше риск случайного логирования полного URL.

Риск компенсируется запретом на возврат `proxyParameter` через API и обязательным маскированием логов.

### 10.3. Fail closed

Fail closed повышает предсказуемость маршрутизации, но снижает успешность публикаций при проблемах proxy. Это осознанный компромисс: если proxy выбран, система не должна незаметно публиковать напрямую.

### 10.4. Нет FK

`Integration.proxy` остаётся строкой без FK. Это сохраняет совместимость с текущим flow через Redis, но означает, что невалидный id может храниться в интеграции до момента posting.

## 11. Планируемые изменения по файлам и модулям

Высокоуровневый список ожидаемых затронутых зон:

### Prisma / Database

- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
  - добавить модель `Proxy`;
  - оставить `Integration.proxy` как `String?`.
- Prisma migration directory
  - добавить миграцию создания таблицы proxy.

### Proxy repository/service

- `libraries/nestjs-libraries/src/database/prisma/...`
  - добавить repository/service для чтения proxy;
  - метод получения списка `{ id, name }`;
  - метод получения `proxyParameter` по id для posting.

### API

- `apps/backend/src/api/routes/no.auth.integrations.controller.ts`
  - заменить `return []` в `GET /integrations/proxies` на чтение из proxy service;
  - endpoint по-прежнему возвращает только `{ id, name }[]`.
- `libraries/nestjs-libraries/src/dtos/integrations/integration.proxy.dto.ts`
  - DTO уже подходит; менять только при необходимости.

### HTTP client

- `libraries/nestjs-libraries/src/...`
  - добавить кастомный axios-like HTTP-клиент;
  - добавить proxy-aware service-обёртку;
  - подключить `https-proxy-agent`;
  - обеспечить safe error handling и отсутствие fallback напрямую.

### Posting providers

- `libraries/nestjs-libraries/src/integrations/social/*`
  - заменить `fetch` на новый proxy-aware axios-клиент только в участках, которые непосредственно относятся к ручке/пути публикации;
  - не выполнять массовую миграцию всех provider HTTP-вызовов;
  - не трогать SDK-запросы в этой итерации;
  - явно не расширять scope на OAuth/refresh/analytics.

### Dependencies

- root `package.json`
  - добавить `https-proxy-agent`.
- `pnpm-lock.yaml`
  - обновится после установки зависимости через PNPM.
