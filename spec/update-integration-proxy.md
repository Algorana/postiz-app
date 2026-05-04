# Спецификация: добавление proxy в модель интеграции

## 1. Цель

Добавить в модель интеграции поле `proxy`, чтобы при подключении социальной сети пользователь мог выбрать proxy до OAuth-редиректа. В текущей итерации выбранный proxy только сохраняется в записи `Integration` и возвращается в списке интеграций; он не применяется к сетевым запросам провайдеров.

## 2. Исходный контекст

- Проект: Postiz monorepo.
- Backend: NestJS, основной слой API в `apps/backend`, доменная/server-логика и Prisma в `libraries/nestjs-libraries`.
- Frontend: Vite React, основные компоненты подключения каналов находятся в `apps/frontend/src/components/launches`.
- Текущий flow подключения:
  1. Пользователь открывает Add Channel.
  2. Frontend получает список provider через `GET /integrations`.
  3. Пользователь выбирает provider.
  4. Frontend вызывает `GET /integrations/social/:provider`.
  5. Backend создаёт OAuth `state`, кладёт данные в Redis и возвращает provider OAuth URL.
  6. После callback frontend вызывает `POST /integrations/social-connect/:provider`.
  7. Если provider требует выбор страницы/канала, используется существующий `inBetweenSteps` flow.

## 3. Требования к данным

### 3.1 Prisma / БД

В модель `Integration` необходимо добавить nullable-поле:

```prisma
proxy String?
```

Семантика:
- `null` — интеграция подключена без proxy.
- `string` — id выбранного proxy.

Требуется добавить миграцию БД для nullable column `proxy` в таблицу интеграций. Поле не должно ломать существующие записи: для всех существующих интеграций значение должно быть `NULL`.

Решение по миграционному формату: добавить Prisma migration directory в `libraries/nestjs-libraries/src/database/prisma/migrations/<timestamp>_add_integration_proxy/migration.sql` с минимальной SQL-миграцией:

```sql
ALTER TABLE "Integration" ADD COLUMN "proxy" TEXT;
```

Индексы, foreign key, default value и `NOT NULL` constraint в текущей итерации не добавляются.

### 3.2 Типы и DTO

Нужно добавить shared DTO/тип для proxy-list контракта:

```ts
type IntegrationProxyDto = {
  id: string;
  name: string;
};
```

Контракт должен использоваться backend response и frontend hook/types.

## 4. Backend требования

### 4.1 Public endpoint списка proxy

Добавить public/no-auth endpoint для получения списка proxy.

Предпочтительный путь можно выбрать по стилю проекта, рекомендуемый вариант:

```http
GET /integrations/proxies
```

Ответ:

```json
[]
```

Будущий формат элементов:

```json
[
  { "id": "proxy-id", "name": "Proxy name" }
]
```

В текущей итерации endpoint всегда возвращает пустой массив.

### 4.2 Старт OAuth с proxy

При старте подключения frontend должен передавать выбранный proxy через query-param:

```http
GET /integrations/social/:provider?proxy=<proxyId>
```

Если выбран `No Proxy`, query-param `proxy` не отправляется.

Backend должен:
- прочитать optional `proxy` из query;
- если `proxy` отсутствует — трактовать как `null`;
- если `proxy` присутствует — сохранить значение в Redis, привязанное к OAuth `state`;
- не выполнять строгую валидацию id proxy в этой итерации;
- не блокировать OAuth flow из-за неизвестного proxy id.

### 4.3 Callback и создание Integration

При обработке callback в `POST /integrations/social-connect/:provider` backend должен:
- восстановить выбранный proxy из Redis по `state`;
- передать proxy в создание/обновление Integration;
- если proxy в Redis отсутствует или потерян — использовать fallback `null` и продолжить подключение;
- для reconnect/refresh flow пользователь также выбирает proxy заново, новое значение должно перезаписать старое значение `Integration.proxy`.

Решение по охвату reconnect: в текущей итерации proxy-step должен покрывать все найденные user-driven reconnect entry points, включая существующие frontend-вызовы refresh/reconnect из `launches.component.tsx` и `render.analytics.tsx`, а не только новый Add Channel flow.

### 4.4 Providers с `inBetweenSteps`

Proxy выбирается до OAuth и до выбора страниц/каналов.

Для providers, где после OAuth есть `inBetweenSteps`, выбранный proxy должен примениться к финальной записи Integration/page. Flow выбора страницы не должен требовать повторного выбора proxy.

### 4.5 Возврат proxy в API

Поле `proxy` нужно возвращать в `GET /integrations/list` вместе с остальными данными интеграции.

Отдельный UI просмотра/редактирования proxy в настройках интеграции в этой итерации не требуется.

### 4.6 Не входит в текущую итерацию

- Использование proxy при OAuth token exchange.
- Использование proxy при refresh token.
- Использование proxy при posting/orchestrator workflows.
- Использование proxy при analytics/mentions/provider-specific requests.
- Таблица proxy и foreign key relation.
- Строгая backend-валидация proxy id.

## 5. Frontend требования

### 5.1 Загрузка списка proxy

Frontend должен получить список proxy через public endpoint.

Поведение:
- если endpoint вернул `[]`, всё равно показывать отдельный шаг выбора proxy с единственным вариантом `No Proxy`;
- если endpoint вернул proxy, показать `No Proxy` + элементы `{ id, name }` из backend;
- если загрузка списка proxy завершилась ошибкой, подключение интеграции блокируется.

### 5.2 Новый шаг в Add Channel flow

После выбора provider пользователь должен попасть на отдельный шаг в modal:

- title: `Select proxy`;
- option: `No Proxy`;
- button: `Continue`.

UI-copy должен быть минимальным.

После выбора proxy и нажатия `Continue` frontend продолжает текущий provider-specific flow.

### 5.3 Охват provider flow

Шаг выбора proxy должен применяться ко всем типам provider flow:

- обычный OAuth redirect;
- providers с `externalUrl`;
- providers с `customFields`;
- Web3 flow;
- Chrome-extension/cookie style flow.

После proxy-step должна выполняться существующая логика конкретного provider без регрессий.

Также proxy-step должен применяться к user-driven reconnect/refresh входам, которые стартуют повторное подключение через `GET /integrations/social/:provider?refresh=<integrationInternalId>`. Если пользователь выбирает `No Proxy`, query-param `proxy` не отправляется, а backend должен очистить старое значение `Integration.proxy` через callback fallback `null`.

### 5.4 Передача proxy

Если пользователь выбрал `No Proxy`:
- query-param `proxy` не добавляется.

Если пользователь выбрал конкретный proxy:
- frontend добавляет `proxy=<id>` к запросу старта OAuth/connect flow, где применимо.

Важно: строковые sentinel-значения вроде `no-proxy`, `null`, пустой строки не должны отправляться вместо отсутствующего proxy.

## 6. UX состояния

### 6.1 Loading

При загрузке proxy-list пользователь не должен уйти дальше до завершения запроса.

### 6.2 Empty state

Если список пустой:
- показать экран `Select proxy`;
- показать единственный вариант `No Proxy`;
- разрешить продолжить.

### 6.3 Error state

Если список proxy не загрузился:
- заблокировать подключение;
- показать ошибочное состояние или сообщение;
- пользователь не должен перейти к OAuth без успешной загрузки списка.

## 7. Риски и компромиссы

### 7.1 Public endpoint

Proxy-list endpoint публичный. В текущей итерации он возвращает пустой массив и не раскрывает чувствительные данные. В будущем при появлении реального списка нужно пересмотреть доступность endpoint и организационную фильтрацию.

### 7.2 Нет backend-валидации proxy id

В этой итерации backend принимает произвольную строку proxy id. Это ускоряет разработку, но позволяет записать мусорное значение при ручной подстановке query-param. Риск принят осознанно.

### 7.3 Fallback `null` при потере Redis proxy

Если proxy не найден в Redis на callback, подключение продолжается с `null`. Это сохраняет устойчивость OAuth flow, но пользовательский выбор может быть потерян без блокировки.

### 7.4 Proxy не используется в provider-запросах

Сохранение `Integration.proxy` не меняет реальное сетевое поведение. Следующая итерация должна отдельно описать, как orchestrator/backend будут применять proxy к запросам провайдеров.

## 8. Acceptance criteria

- В Prisma schema у `Integration` есть nullable поле `proxy String?`.
- Есть миграция БД, добавляющая nullable column `proxy` без влияния на существующие записи.
- Есть shared DTO/тип proxy item `{ id: string; name: string }`.
- Public endpoint списка proxy возвращает массив proxy items; в текущей итерации — `[]`.
- После выбора provider frontend показывает отдельный шаг `Select proxy`.
- При пустом списке proxy пользователь видит только `No Proxy` и может продолжить.
- При ошибке загрузки proxy-list подключение блокируется.
- При выборе `No Proxy` frontend не отправляет query-param `proxy`.
- При выборе proxy frontend отправляет `proxy=<id>` на старт connect/OAuth flow.
- Backend сохраняет выбранный proxy через OAuth state/Redis и записывает его в `Integration.proxy`.
- При отсутствии proxy в Redis callback не падает, а сохраняет `null`.
- При reconnect пользователь выбирает proxy заново, новое значение перезаписывает старое.
- `GET /integrations/list` возвращает поле `proxy`.
- Реальное использование proxy при OAuth/posting/refresh не реализуется в этой итерации.
- После реализации должны проходить TypeScript/types и root lint.

## 9. Планируемые изменения по файлам и модулям

Ожидаемо будут затронуты следующие области:

### Backend / shared libraries

- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
  - добавить `proxy String?` в `model Integration`.

- Prisma migration directory / migration mechanism проекта
  - добавить миграцию nullable column `proxy`.

- `libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts`
  - принимать и сохранять proxy при create/update/upsert Integration;
  - перезаписывать proxy при reconnect.

- `libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts`
  - протянуть proxy через service слой.

- `apps/backend/src/api/routes/integrations.controller.ts`
  - читать optional `proxy` query-param на старте OAuth;
  - сохранять proxy в Redis по `state`;
  - при необходимости добавить/протянуть endpoint списка proxy, если выбран authenticated controller.

- `apps/backend/src/api/routes/no.auth.integrations.controller.ts`
  - добавить public endpoint proxy-list, если он размещается в no-auth controller;
  - восстановить proxy из Redis на callback и передать в create/update Integration.

- DTO/types в `libraries/nestjs-libraries/src/dtos/...` или близком shared месте
  - добавить `IntegrationProxyDto` / response type `{ id: string; name: string }`.

### Frontend

- `apps/frontend/src/components/launches/add.provider.component.tsx`
  - добавить загрузку proxy-list;
  - добавить отдельный шаг `Select proxy` после выбора provider;
  - применить шаг ко всем provider-specific branches;
  - добавлять query-param `proxy` только при выборе конкретного proxy.

- `apps/frontend/src/components/launches/launches.component.tsx`
  - применить proxy-step к user-driven reconnect/refresh flow.

- `apps/frontend/src/components/platform-analytics/render.analytics.tsx`
  - применить proxy-step к user-driven reconnect/refresh flow.

- Возможный новый hook рядом с существующими frontend hooks
  - отдельный SWR hook для `GET /integrations/proxies`, с соблюдением rules-of-hooks.

- Типы frontend/shared imports
  - использовать shared DTO или синхронизированный тип proxy item.

### Проверки

- Запустить проверки типов и lint из корня проекта через `pnpm`.
