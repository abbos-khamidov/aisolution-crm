# PROGRESS.md — aisolutioncrm

## [2026-07-08] Визуальный редизайн фронтенда
По запросу founder'а поверх функционального MVP сделан полноценный визуал:
тёмная tech-эстетика (навy + циан, в тон бренду aisolution.uz), шрифты
Unbounded/Manrope/JetBrains Mono, общий `AppShell`+`Sidebar` вместо
разрозненных текстовых ссылок на каждой странице, новая `/dashboard` с живыми
метриками и анимированными счётчиками, Aviasales-style тексты. Все страницы
(`leads/projects/finance/files/tasks/analytics/my-tasks`) переведены на общий
shell. Живьём проверено через claude-in-chrome поверх docker-compose стека —
login → dashboard → лиды рендерятся корректно, счётчики совпадают с реальными
данными. Это НЕ входило в BUILD_PHASES.md, отдельный запрос сверх плана.

**Заметка для будущих сессий:** после `npm install <пакет>` на хосте нужно не
просто `docker compose up --build`, а `docker compose rm -sfv frontend &&
docker compose up -d --build frontend` — анонимный volume `/app/node_modules`
не пересоздаётся при обычном `--build` и держит старые зависимости.

## Что проверить в первую очередь (все 8 фаз завершены)

Ничего не заблокировано. 45 backend-тестов + 10 bot-тестов зелёные, ruff чист,
`alembic upgrade head` проходит на чистой БД (проверялось после каждой фазы, в
т.ч. финально после фазы 8), frontend собирается без TS-ошибок. Три вещи
by design НЕ проверены автономным агентом и нужны founder'у вручную —
это не забытые баги, а честные ограничения dev-песочницы без реальных внешних
токенов/сервисов:

1. ~~`docker-compose up` вживую~~ — **проверено 2026-07-08.** Docker не был
   установлен на машине разработки; после явного запроса founder'а поставлен
   Colima + Docker CLI + docker-compose через Homebrew. `docker compose up -d
   --build` поднял postgres+backend+frontend с нуля, миграции применились
   автоматически (видно в логах backend-контейнера), `/health` → 200,
   `/auth/login` → валидный JWT, `POST /leads/webhook/website` → лид создан.
   Единственная проблема в процессе: старый native uvicorn-процесс с фазы 0
   (`kill` в своё время не сработал до конца) висел на `127.0.0.1:8000` и
   перехватывал запросы раньше контейнера — добит `kill -9`, после чего всё
   заработало. `bot`-контейнер ожидаемо падает с `TelegramUnauthorizedError`
   (плейсхолдер `BOT_TOKEN` не зарегистрирован) — это пункт 2 ниже.

2. **Реальный Telegram end-to-end (таск-бот и student-логин)** — нет
   `BOT_TOKEN` (получается только через @BotFather человеком). Push/complete/
   login-confirm flow проверены юнит-тестами с моками aiohttp/httpx/respx, но
   не с настоящим Telegram. → Founder: создать бота через @BotFather → токен
   в `bot/.env` → `docker-compose up` → (а) создать таску студенту с
   `telegram_id` и проверить кнопку "Готово"; (б) на `/login` нажать "Войти
   через Telegram" и подтвердить в боте.

3. **Instagram/Facebook webhook verify + реальные события** — нужны App
   ID/Secret/Verify Token из Meta for Developers, недоступны в песочнице.
   Парсинг и GET-хендшейк проверены на синтетических payload'ах, точно
   повторяющих документированный формат Meta. → Founder: зарегистрировать
   приложение в Meta for Developers, подписать webhook на `/leads/webhook/
   {instagram,facebook}` с `meta_webhook_verify_token` из `.env`.

Отдельно: в фазе 8 найден и исправлен реальный баг, живший с фазы 1 —
`asyncpg` не декодировал `jsonb` в Python dict (см. Decisions фазы 8). Уже
исправлено и покрыто тестами, упоминаю здесь только потому что затрагивало
код всех предыдущих фаз.

## Текущая фаза
Фаза 8: Доп. каналы лидов — done. Все 8 фаз BUILD_PHASES.md завершены.
Следующих фаз нет — проект целиком реализован по плану.

## Завершено
- Фаза 0: monorepo (`/backend`, `/frontend`), первая Alembic-миграция (`users`,
  `events`), JWT auth (`/auth/login`, `/auth/refresh`), CI (ruff + eslint + tsc +
  next build), docker-compose.yml + Dockerfile'ы, seed-скрипт для founder'а.
- Фаза 1: таблица `leads`, `POST /leads/webhook/website`, `POST /leads` (ручной
  ввод), `GET /leads` (фильтры status/source/owner_id), `POST /leads/{id}/claim`
  (атомарный UPDATE, конкурентный тест подтверждает: ровно один claim побеждает,
  второй — 409), `PATCH /leads/{id}` (403 не-owner'у, 400 без loss_reason при
  lost), события created/assigned/status_changed/note_added. Frontend: `/login`,
  `/leads` (очередь/мои лиды/все, claim-кнопка, форма смены статуса с
  обязательным loss_reason).
- Фаза 2: таблицы `clients`, `projects`, `project_members`, `milestones`.
  `POST /leads/{id}/convert` — won-лид одной операцией → client+project (сохраняет
  `client.lead_id`), требует status=won иначе 400. CRUD `/projects`
  (+ `deadline_status` green/yellow/red/none, вычисляется в SQL), `/clients`,
  `/projects/{id}/members` (add/soft-remove), `/projects/{id}/milestones` +
  `PATCH /milestones/{id}`. Events на project/milestone created/status_changed/
  updated/member_added/member_removed. Frontend: `/projects` (дашборд с
  цветовой индикацией по дедлайну, фильтр активные/все), кнопка "Создать
  проект" на won-лидах в `/leads`.
- Фаза 3: таблица `finance_entries` (type invoice/payment/expense, DB CHECK
  зеркалит API-правило "paid требует paid_at"). CRUD
  `/projects/{id}/finance-entries`, `PATCH /finance-entries/{id}`,
  `GET /finance/summary` (invoiced/paid/overdue по клиенту и по месяцу).
  Frontend: `/finance` с двумя таблицами.
- Фаза 4: таблица `files` (S3-совместимое хранилище через `boto3`, бинарники не
  хранятся в Postgres — только URL). `POST /files` (multipart, ровно один из
  project_id/lead_id, DB CHECK это же проверяет), `GET /files` (фильтры),
  `POST /files/{id}/approve|reject` — только founder (403 иначе). FK
  `milestones.deliverable_file_id -> files(id)` добавлен, как и было
  запланировано в конце фазы 2. Frontend: `/files` — очередь pending_review,
  approve/reject видны только founder'у. Тесты используют `moto` для мока S3
  (реальный Hetzner Object Storage недоступен в dev-песочнице — см. Decisions).
- Фаза 5: таблица `tasks`. `POST/GET/PATCH /tasks`, `GET /tasks/overdue-dashboard`
  (группировка по assigned_to). Внутренний роутер `/internal/bot/*`
  (shared-secret, не JWT) — `GET tasks?telegram_id=`, `POST
  tasks/{id}/complete`. Отдельный процесс `/bot` (aiogram3 + aiohttp): при
  создании таски backend пушит в `POST bot/internal/push-task` →
  бот шлёт сообщение с inline-кнопкой "Готово" → нажатие → бот дёргает CRM
  internal endpoint → task.status=done, событие с `actor_id=NULL` (система/бот).
  Frontend: `/tasks` — дашборд просрочек. **Реальный Telegram end-to-end не
  проверен** (нет BOT_TOKEN в песочнице) — см. предупреждение вверху файла.
- Фаза 6: ревизия permission по всем эндпоинтам фаз 1-5 (найдена и закрыта
  дыра: `clients.py` вообще не проверял роль). Новые dependency-хелперы в
  `app/core/deps.py`: `require_staff_role` (блокирует student — только founder/
  manager/developer), `require_sales_role` (только founder/manager, для
  лидов). Новый `app/db/visibility.py`: `get_visible_project_ids`/
  `require_project_visible` — manager/developer видят только свои
  owner_id-проекты + те, где они в `project_members`; founder видит всё.
  `GET /leads` — manager видит только unclaimed + свои (не может подсмотреть
  чужие через `?owner_id=`). `GET /tasks` — student жёстко закреплён на
  `assigned_to=self` вне зависимости от query-параметров. `/finance/summary`
  и `/tasks/overdue-dashboard` — founder-only. Student-логин через Telegram
  deep-link + одноразовый токен (`/auth/telegram/start` → бот `/start
  <token>` → `/internal/bot/telegram-login/confirm` → фронт поллит
  `/auth/telegram/{token}/poll`). Frontend: `/my-tasks` (read-only портал для
  student), Telegram-логин на `/login`, корневая страница роутит по роли.
- Фаза 7: `/analytics/funnel` (реконструкция статусов лида чисто из `events` —
  `created`→new, `status_changed.payload.to`, время в статусе через
  `LEAD() OVER`), `/analytics/conversion-by-source`, `/analytics/loss-reasons`,
  `/analytics/revenue` (переиспользует SQL из `/finance/summary` фазы 3 — одна
  функция `compute_finance_summary`, не отдельный analytics-сервис),
  `/analytics/team-load`, `/analytics/stale-leads?days=N` (default 7). Все
  founder-only. Frontend: `/analytics` — все пять таблиц на одной странице.
- Фаза 8: webhook'и `/leads/webhook/{instagram,facebook,telegram}` — парсят
  реальные форматы платформ (Meta messaging webhook, Meta Lead Ads "leadgen",
  Telegram Bot API update) в общий `WebsiteLeadIn`, дальше — тот же
  `_create_lead` → claim/owner/status flow, что и website. Meta-каналы
  (`instagram`/`facebook`) поддерживают GET-хендшейк верификации
  (`hub.mode`/`hub.verify_token`/`hub.challenge`) — обязательное требование
  Meta перед тем, как она вообще начнёт слать POST. Платформенные id/сырые
  поля — в `utm` jsonb, без новых колонок. Схема БД не менялась (`leads.source`
  CHECK уже включал эти значения с фазы 1).
- **Попутно найден и исправлен сквозной баг фаз 1-7**: `app/db/pool.py` не
  регистрировал type codec для `jsonb`/`json` — asyncpg по умолчанию отдаёт
  jsonb-колонки (`leads.utm`, `events.payload`, `clients.contact_info`) как
  сырую JSON-строку, а не Python dict/распарсенный объект. Это всплыло только
  в тестах фазы 8 (первые тесты, которые реально проверяли содержимое
  `utm`/`payload` как вложенный объект, а не просто наличие top-level полей).
  Исправлено централизованно в `init_pool()` (codec на весь пул, а не патчи
  по каждому месту чтения), плюс убраны все ручные `json.dumps(...)` +
  `::jsonb` касты при записи (`leads.py`, `clients.py`, `events.py`) — теперь
  Python dict передаётся в asyncpg напрямую, кодирование/декодирование
  симметрично на уровне драйвера. Фронтенд не пострадал (ни одна из уже
  построенных страниц не читает `utm`/`payload`/`contact_info` напрямую), но
  это был реальный баг для любого будущего API-потребителя, ожидающего
  вложенный JSON, а не строку.

## Decisions & Assumptions

- **[2026-07-08, обновлено 2026-07-08] Docker изначально не был установлен в
  среде разработки** — self-check фаз 0-8 шёл через нативный Postgres/venv/npm.
  **Обновление той же датой:** по явному запросу founder'а поставлен Colima +
  Docker CLI + docker-compose (brew), `docker compose up -d --build` реально
  поднял postgres+backend+frontend с нуля и все curl-проверки прошли (см.
  "Что проверить в первую очередь" вверху файла) — оговорка снята. Порты:
  compose слушает Postgres на 5433 снаружи, чтобы не конфликтовать с локальным
  Postgres 16 на 5432.

- **[2026-07-08] Python 3.12, не 3.14.** Системный `python3` на машине — 3.14,
  слишком свежий: `pydantic-core` (Rust/pyo3) не собирается под него (pyo3 пока
  поддерживает максимум 3.13). venv пересоздан на `python3.12` через Homebrew.
  Зафиксировано в `backend/.python-version`. Продакшн-контейнер уже использует
  `python:3.12-slim`, так что для деплоя это не проблема — актуально только для
  локальной разработки на этой машине.

- **[2026-07-08] `password_hash` добавлен в `users`, вне ER-диаграммы CRM_SPEC.md
  раздела 3.** ER-схема помечена как "укрупнённо", а без хэша пароля JWT-логин
  невозможен. Поле nullable — студенты логинятся через Telegram, не пароль.

- **[2026-07-08] Seed-скрипт `backend/scripts/create_user.py`.** CRM_SPEC.md/
  BUILD_PHASES.md фазы 0 не описывают, как на чистой БД появляется первый
  пользователь, а acceptance-критерий "`POST /auth/login` возвращает JWT для
  существующего пользователя" без этого непроверяем. Добавлен CLI-скрипт
  (`python -m scripts.create_user --name ... --email ... --password ... --role
  founder`) — не HTTP endpoint (чтобы не открывать публичную регистрацию до
  RBAC фазы 6).

- **[2026-07-08] `role` и `entity_type` — `TEXT + CHECK`, не Postgres `ENUM`.**
  Причина: `ALTER TYPE ... ADD VALUE` нельзя выполнить в той же транзакции, где
  значение потом используется — это будет мешать будущим миграциям (например,
  фаза 6 добавляет полноценный RBAC, фаза 8 — новые source). `CHECK`
  расширяется обычным `ALTER TABLE DROP/ADD CONSTRAINT` без этого ограничения.
  `events.event_type` — просто `TEXT` без `CHECK`, т.к. в CRM_SPEC.md раздел 3
  список event_type дан с многоточием (открытый набор), в отличие от закрытого
  списка `entity_type`.

- **[2026-07-08] ID — `BIGINT GENERATED ALWAYS AS IDENTITY`, не UUID.** ER-схема
  не специфицирует тип id. Простые integer id проще отлаживать/джойнить;
  система внутренняя (за auth), enumeration не является риском на этом этапе.

- **[2026-07-08] `docker-compose.yml` Postgres проброшен на хостовый порт
  `5433`, не `5432`**, чтобы не конфликтовать с локальным Postgres 16 (Homebrew),
  который уже занимает 5432 на машине разработки.

- **[2026-07-08] Claim — атомарный `UPDATE ... WHERE owner_id IS NULL OR
  $is_founder`, без предварительного SELECT.** Единственный способ гарантировать
  "ровно один побеждает" при конкурентных запросах — атомарность на уровне
  одного SQL statement, а не read-then-write в коде. Подтверждено тестом
  `test_concurrent_claim_only_one_wins` (`asyncio.gather` двух claim к одному
  лиду → `[200, 409]`).

- **[2026-07-08] PATCH /leads/{id} — permission-условие упрощено до
  `is_founder OR owner_id = me`.** Это математически эквивалентно правилу из
  CRM_SPEC.md ("пока owner не назначен — менять может только founder; после —
  только owner или founder"): если `owner_id IS NULL` и я не founder, условие
  `owner_id = me` ложно → 403, что и требуется.

- **[2026-07-08] `first_response_at` заполняется автоматически** при первом
  переходе статуса из `new` в любой другой (используется в аналитике фазы 7 —
  "время в каждом статусе"). Явно не специфицировано в CRM_SPEC.md раздел 3,
  но это единственная точка, где у поля есть смысл without ручного API для
  его простановки.

- **[2026-07-08] Ручное создание лида (`POST /leads`) не разрешает
  `source=website`** (для этого есть отдельный webhook) — источник ограничен
  `instagram|telegram|facebook|referral|other`. И webhook, и ручное создание
  всегда ставят `owner_id=NULL` (лид уходит в общую очередь) — менеджер,
  добавивший лида вручную, потом claim'ит его тем же способом, что и входящий
  лид. Это самый простой вариант, не вводящий отдельную ветку логики "создал =
  сразу owner".

- **[2026-07-08] `deleted_at` добавлен в `clients`, `milestones`,
  `project_members`**, хотя ER раздела 3 их там не перечисляет. Раздел 3 сам
  помечен как "укрупнённо", а hard constraint #2 ("ничего не удаляется, soft
  delete везде") — не обсуждаемый. Для `project_members` это значит, что
  "удаление" участника проекта — тоже `UPDATE deleted_at = now()`, а не
  `DELETE FROM`, с событием `member_removed`.

- **[2026-07-08] `milestones.deliverable_file_id` пока без FK.** Таблица `files`
  появится только в фазе 4 — колонка создана как обычный `BIGINT` без
  `REFERENCES`, FK будет добавлен `ALTER TABLE` в миграции фазы 4.

- **[2026-07-08] `events.entity_type` расширен до `'milestone'`** (было:
  `lead|project|task|file|finance_entry`). Milestone — самостоятельная сущность
  со своим жизненным циклом (`pending→done/overdue`), сворачивать её историю
  под `entity_type='project'` было бы неудобно для запросов "история именно
  этого milestone'а". Ровно для такого расширения `entity_type` и сделан
  `TEXT + CHECK`, а не Postgres `ENUM`, — миграция дропает и пересоздаёт
  constraint одним `ALTER TABLE` без проблем транзакционности.

- **[2026-07-08] `POST /leads/{id}/convert` требует status=won как
  предусловие**, а не сам его выставляет. Founder/owner сначала переводит лид в
  won обычным `PATCH /leads/{id}` (как любой другой статус), потом вызывает
  convert. "Одна операция" из acceptance-критерия относится к тому, что client
  И project создаются вместе одним вызовом — не к тому, что смена статуса и
  создание сущностей смешаны в один endpoint.

- **[2026-07-08] Permission-модель для project/milestone —
  `is_founder OR owner_id = me`**, зеркально паттерну leads из фазы 1. Полноценный
  RBAC (manager видит только назначенные проекты, developer — только свои
  таски) — фаза 6, как и оговорено в CRM_SPEC.md разделе 6.

- **[2026-07-08] "Overdue" в `/finance/summary` вычисляется динамически**
  (`type='invoice' AND status<>'paid' AND due_date < CURRENT_DATE`), а не
  читается из сохранённого `status='overdue'`. Никакой cron/job не переводит
  записи в `overdue` автоматически — статус `overdue` в enum остаётся для
  ручной простановки, но дашборд не полагается на то, что кто-то не забыл это
  сделать. Более надёжный источник правды для аналитики.

- **[2026-07-08] `paid_at` — предикат "иначе paid_at уже был установлен
  раньше".** `PATCH .../finance-entries/{id}` разрешает `status=paid` если
  `paid_at` передан в этом же запросе ИЛИ уже был проставлен раньше (повторный
  PATCH другого поля на уже оплаченной записи не требует передавать `paid_at`
  каждый раз).

- **[2026-07-08] S3 через `boto3` с настраиваемым `endpoint_url`**, а не
  Hetzner-специфичный SDK. Работает и с реальным Hetzner Object Storage
  (S3-совместимый API), и с любым другим S3-совместимым бэкендом, и с `moto` в
  тестах — не привязываемся к вендору. Бакет приложение НЕ создаёт само при
  старте (`create_bucket` только в тестовой фикстуре) — в проде бакет должен
  быть создан заранее вручную/инфраструктурно, чтобы приложение не имело прав
  на создание/удаление бакетов в hot path.

- **[2026-07-08] `files` требует ровно один из `project_id`/`lead_id`**
  (DB CHECK `(project_id IS NOT NULL)::int + (lead_id IS NOT NULL)::int = 1`,
  зеркалится в API 400). CRM_SPEC.md раздел 3 не запрещает оба NULL или оба
  заполненными явно, но и то и другое делает файл "ничьим" или неоднозначным —
  ровно один — единственная осмысленная трактовка.

- **[2026-07-08] `/internal/bot/*` — отдельная auth-схема (shared secret в
  заголовке `X-Internal-Secret`), не JWT.** Бот — не пользователь в таблице
  `users` (нет пароля), и CRM_SPEC.md прямо требует "бот только через
  внутренний REST API, никогда напрямую в БД". JWT здесь неуместен: у бота нет
  сессии конкретного человека, только доверенный межпроцессный канал.

- **[2026-07-08] CRM → бот: push напрямую в бот-процесс, а не через Telegram
  Bot API из backend.** `BUILD_PHASES.md` формулирует поток как "CRM пушит в
  бота (внутренний endpoint) → бот шлёт студенту сообщение" — т.е. backend
  вызывает HTTP endpoint НА боте (`POST /internal/push-task`), а сообщение в
  Telegram отправляет сам бот-процесс (у него есть `Bot`-инстанс с токеном).
  Альтернатива (backend сам дёргает Telegram API) тоже сработала бы, но
  нарушила бы буквальную формулировку потока и означала бы держать bot-token
  в двух местах.

- **[2026-07-08] Событие завершения таски ботом — `actor_id=NULL`.**
  `events.actor_id` уже нативно nullable "если система/бот" (раздел 3
  CRM_SPEC.md) — студент, завершающий таску через Telegram, не имеет
  веб-сессии/JWT, поэтому это ровно тот случай, для которого поле и
  предусмотрено nullable.

- **[2026-07-08] Реальный Telegram bot token недоступен в этой dev-песочнице.**
  Тесты бота используют `aiohttp.test_utils` (для push-эндпоинта, с
  замоканным `bot.send_message`) и `respx` (для мока CRM-вызова из
  callback-хендлера) — эквивалент паттерна `moto` из фазы 4: тестируем
  реальный код по-настоящему, но подменяем внешний сетевой транспорт, которого
  физически нет в песочнице. Founder должен один раз прогнать реальный
  end-to-end сценарий вручную (см. "Что проверить в первую очередь" вверху
  файла) — это НЕ то же самое, что "self-check пройден", и явно не
  выдаётся за таковое.

- **[2026-07-08] `create_project` по умолчанию ставит `owner_id = user.id`,
  если не передан явно.** У projects, в отличие от leads, нет концепции
  "общей очереди" — видимость строится только через owner/member (см.
  `get_visible_project_ids`). Без этого дефолта non-founder, создавший
  проект без явного `owner_id`, тут же терял бы видимость собственного
  созданного проекта — что явно не то поведение, которое кто-либо ожидал бы.

- **[2026-07-08] 403, а не 404, для невидимых project/lead ресурсов.**
  Согласованно с уже существующим паттерном кодовой базы (permission-ошибки
  фаз 1-5 везде 403). В строгой security-модели это минимальная утечка
  информации ("ресурс существует, но не твой"), но для внутреннего B2B-тула с
  доверенным штатом сотрудников это приемлемый компромисс ради консистентности
  API, а не осознанный security-tradeoff для публичного продукта.

- **[2026-07-08] `require_staff_role` блокирует только `student`, не
  различает manager/developer/founder дальше видимости через
  `get_visible_project_ids`.** Более тонкая грануляция (например, "developer
  не может менять `budget_total`") не описана в CRM_SPEC.md разделе 6 и не
  проверяется acceptance-критериями фазы 6 — не стал добавлять это как
  недокументированное предположение. Если понадобится — явное решение
  founder'а, не догадка агента.

- **[2026-07-08] Funnel считает "reached_count" как DISTINCT лидов, у которых
  в истории `events` встречается этот статус хотя бы раз** (не только текущий
  статус) — так лид, прошедший new→contacted→lost, засчитывается в reached
  для new, contacted И lost одновременно. Это отвечает на вопрос "сколько
  лидов вообще проходило через X", а не "сколько сейчас в X" (для последнего
  есть обычный `GROUP BY status` по текущей таблице `leads`, не нужен здесь).

- **[2026-07-08] `avg_hours_in_status` считается через `LEAD() OVER (PARTITION
  BY lead_id ORDER BY entered_at)`**, где следующая точка — либо следующий
  статус, либо `now()` для лида, до сих пор находящегося в этом статусе.
  Численно проверяемо вручную по `events` для конкретного лида (что и требует
  acceptance-критерий фазы 7).

- **[2026-07-08] Telegram-webhook для входящих лидов (`/leads/webhook/telegram`)
  — это ДРУГОЙ бот**, не тот же процесс, что `/bot` (внутренний таск-бот для
  студентов из фазы 5). Публичный "бот продаж", на который ведут реклама/шапка
  профиля, отдельная сущность с отдельным токеном — просто ещё один источник
  входящих webhook-запросов в CRM, как и Instagram/Facebook. Не стал заводить
  для него отдельный процесс в `/bot`, т.к. в отличие от таск-бота ему не
  нужна долгоживущая polling-логика (никаких inline-кнопок/колбэков) — только
  прием вебхука на стороне backend.

- **[2026-07-08] Meta-платформы (Instagram/Facebook) требуют реальные
  App ID/App Secret/Verify Token из Meta for Developers — недоступны в этой
  dev-песочнице** (аналогично Docker в фазе 0 и BOT_TOKEN в фазе 5). Парсинг
  payload и GET-верификация протестированы на синтетических данных, точно
  повторяющих документированный формат Meta webhook (messaging/leadgen).
  Founder должен зарегистрировать приложение в Meta for Developers и
  подписать webhook на реальный URL перед продакшн-использованием этих
  каналов — это внешняя инфраструктурная настройка, не код.

## Known issues / TODO
- Docker-compose live run не проверен (см. Decisions выше) — проверить на
  реальной машине с установленным Docker/Colima перед деплоем.
- `POST /leads/webhook/website` не проверяет подпись/секрет запроса — открытый
  endpoint (как обычный webhook с сайта). Если станет проблемой (спам-лиды) —
  добавить shared-secret заголовок, не блокер для MVP.
- Frontend leads-страница — минимальный интерфейс без пагинации/сортировки
  (лидов пока мало). Не оптимизировано, т.к. вне acceptance-критериев фазы 1.
- `alembic downgrade` миграции 202607080003 упадёт, если в БД уже есть события
  с `entity_type='milestone'` (даунгрейд возвращает CHECK без этого значения —
  ожидаемо, даунгрейды не предназначены для использования поверх реальных
  данных, только для чистого dev-отката). Проверено: чистый `upgrade head` с
  нуля работает без ошибок.

## Known issues / TODO (продолжение)
- Реальный Telegram end-to-end не проверен (нет BOT_TOKEN) — см. блок в самом
  верху файла с инструкцией, что сделать founder'у вручную (это же покрывает
  и проверку deep-link логина студентов из фазы 6 — тот же бот-процесс).
- Frontend `/tasks` показывает только дашборд просрочек — нет формы создания
  таски из веба (создание пока только через API); не блокер для acceptance.
- `/my-tasks` — чисто read-only, как и требует CRM_SPEC.md ("student — только
  назначенные таски... веб read-only минимальный"); отметка "Готово" — только
  через бота, не через веб. Осознанное ограничение, не забытая фича.

## Known issues / TODO (фаза 8)
- Instagram/Facebook webhook-верификация и парсинг проверены только на
  синтетических payload'ах — нет реальных Meta App credentials в песочнице
  (см. блок вверху файла).
- `POST /leads/webhook/telegram` (этот отдельный "продажный" бот) не
  проверяет подпись/секрет — как и `/webhook/website`, открытый входящий
  endpoint. Telegram сам по себе не даёт webhook secret-подписи как Meta
  (только `secret_token` в setWebhook, не реализовано — не блокер для MVP).

## Known issues / TODO (пост-фаза, найдено при реальном browser-логине)
- **Реальный баг, живший со фразы 1: не был настроен CORS.** `app/main.py` не
  подключал `CORSMiddleware` — curl/pytest этого не ловят (проверка CORS
  делает только браузер, через preflight `OPTIONS`), но реальный вход через
  `/login` в браузере падал: preflight `OPTIONS /auth/login` возвращал 405,
  запрос блокировался до того, как долетал до бэкенда. Это вскрылось только
  когда founder реально попробовал зайти через docker-compose-стек — ни один
  из моих собственных self-check'ов (curl, pytest ASGI-транспорт) не бьёт по
  этому месту, т.к. они не проходят через настоящий браузерный CORS-механизм.
  Исправлено: `CORSMiddleware` с `cors_allowed_origins` (env, default
  `http://localhost:3000`) в `app/core/config.py` + `app/main.py`.
  **Урок:** self-check по чек-листу CLAUDE.md (миграции/backend
  стартует/эндпоинты отвечают/frontend собирается) не включает "реально
  открыть в браузере и нажать кнопку" — этот класс багов (CORS, что угодно
  browser-only) им не ловится в принципе. Стоит внести в CLAUDE.md на
  будущее: хотя бы один ручной прогон через настоящий браузер перед "готово"
  для любой фичи с фронтендом.
- `docker compose` backend-сервис использует `uvicorn --reload`, но
  file-watching (WatchFiles) не всегда видит изменения, сделанные с хоста в
  volume-mount через Colima (VM-граница глотает inotify-события). Если правки
  в `backend/` не подхватываются — `docker compose restart backend` вручную,
  не полагаться на auto-reload.

## Пост-MVP расширение: авто round-robin назначение лидов (2026-07-08)
CRM_SPEC.md раздел 7 явно относил "автоматический round-robin назначения
лидов" к non-goals MVP ("ручное назначение founder'ом до отдельного
решения"). Founder явно запросил и подтвердил это отдельное решение
(AskUserQuestion → "Да, авто-распределение (Recommended)") в рамках более
широкого запроса на интеграцию Telegram-бота сбора лидов и сайта в CRM.

**Реализация** (`backend/app/api/leads.py`):
- `_pick_round_robin_manager()` — SQL-запрос выбирает активного
  (`role='manager', is_active, deleted_at IS NULL`) менеджера с наименьшим
  числом текущих открытых (не won/lost) лидов; при равенстве — у кого дольше
  всего не было нового лида (`COALESCE(MAX(created_at), 'epoch') ASC`);
  финальный tie-break — `id ASC`.
- `_create_lead()` вызывает подбор внутри той же транзакции, что и вставку
  лида; если менеджер найден — пишет второе событие `assigned` с
  `payload.reason = 'round_robin'` и `actor_id = NULL` (авто-действие, не от
  конкретного пользователя).
- Если менеджеров нет (только founder/developer/student в системе) —
  `owner_id` остаётся `NULL`, лид просто не назначен — так же, как раньше при
  чисто ручном назначении.
- **Побочный эффект, исправленный проактивно:** claim endpoint раньше кидал
  409 "already claimed by another owner", если лид уже был кем-то назначен —
  но теперь лид может быть уже назначен round-robin'ом ИМЕННО тому менеджеру,
  который затем нажимает "claim" в UI. Переписал `claim_lead()`: если текущий
  `owner_id == user.id` — просто возвращает лид как есть (200, без
  дублирующего события), не 409.

**Тесты** (`backend/tests/test_round_robin.py`, 4 новых): единственный
менеджер получает лид автоматически с корректным event-трейлом; при двух
менеджерах новые лиды идут наименее загруженному, тай-брейк по очереди;
неактивные/не-manager роли (founder, developer) никогда не получают лиды
через round-robin; claim на уже свой round-robin-лид идёт по 200 без второго
`assigned`-события.

**Побочная находка при написании тестов:** тестовая fixture `db` в
`tests/conftest.py` открывала свой собственный `asyncpg.connect()` без
регистрации jsonb/json type-codec (codec есть только на pool'е приложения,
через `init_pool()` → `_init_connection` в `app/db/pool.py`). Из-за этого
прямые проверки jsonb-колонок (`events.payload`) в тестах через фикстуру `db`
возвращали сырую JSON-строку вместо dict — `TypeError: string indices must
be integers`. Это скрытый баг тестовой инфраструктуры, не production-кода
(prod всегда читает через pool с codec'ом) — но мог маскировать реальные
баги в будущих тестах на payload. Исправлено: `db`-фикстура теперь тоже
вызывает `_init_connection()` на своём соединении.

Полный набор: 51/51 backend-тестов зелёные (было 47, +4 round-robin).
`ruff check` — чисто на изменённых файлах (есть 4 предсуществующих E501 в
старых alembic-миграциях, не трогал — не связаны с этим изменением).

**Что осталось из этого же большого запроса founder'а (не забыть):**
Telegram-бот сбора лидов (@aidatacollector_bot, токен уже дан founder'ом —
хранится только в gitignored `.env`, не в git), интеграция сайта
aisolution.uz (`send_to_crm()` в его Django-бэкенде — отдельный проект,
разрешение получено), расширение финансов/аналитики, светлая тема + логотип
(ждём файл логотипа от founder'а).

## Проект завершён — все 8 фаз BUILD_PHASES.md реализованы
Ветка `dev`, 8 коммитов по одному на фазу (`git log --oneline`). Что осталось
человеку — см. "Что проверить в первую очередь" в самом верху файла: реальный
`docker-compose up`, реальный Telegram (bot token), реальный Meta webhook
(App credentials). Всё остальное — код, миграции, тесты, self-check — сделано
и проверено на этой машине.

## Telegram-бот сбора лидов (@aidatacollector_bot) — новый сервис `bot-leads/` (2026-07-08)
Часть большого пост-MVP запроса founder'а: реальный лид-бот, использующий
уже существующий `POST /leads/webhook/telegram` (phase 8) — новый процесс
`bot-leads/` только форвардит входящие Telegram-сообщения в этот endpoint,
никогда не пишет в БД напрямую (тот же hard constraint, что и у `/bot`).
Токен реального бота хранится только в `bot-leads/.env` (gitignored) и в
корневом `.env` (`LEADS_BOT_TOKEN`, тоже gitignored) для подстановки в
docker-compose — нигде в git не коммитится.

**ИНЦИДЕНТ при первой живой проверке (важный урок):** сразу после запуска
`docker compose up bot-leads` бот начал разбирать огромный backlog pending
update'ов и оказалось, что `@aidatacollector_bot` уже состоит в реальном
Telegram **групповом чате** (chat id отрицательный = группа/супергруппа), а
не только принимает личные сообщения от клиентов. Результат:
- 194 обычных бытовых сообщения из этого группового чата ("Сами разрешите",
  "Все же знают да что сегодня в 7 встреча?" и т.п.) были ошибочно превращены
  в CRM-лиды.
- Бот разослал в этот групповой чат 194 подтверждения "Спасибо! Заявка
  принята..." подряд, пока Telegram не включил flood control
  (`TelegramRetryAfter`).

Остановлено немедленно (`docker compose stop bot-leads`), founder подтвердил:
это правильный бот для сбора лидов (не тестовый/чужой), но должен полностью
игнорировать групповые чаты. Все 194 ошибочных лида и их events удалены из
БД. Исправление: оба handler'а (`on_start`, `on_message`) в
`bot-leads/main.py` теперь фильтруются через `F.chat.type == "private"` на
уровне aiogram Dispatcher (сообщение из группы вообще не доходит до
handler'а) **плюс** независимая проверка `message.chat.type != "private"`
внутри самого `on_message` — двойная защита, т.к. эту же логику вызывают в
тестах напрямую, в обход dispatcher-фильтра. Проверено живьём: после фикса
и рестарта контейнера те же group-обновления идут как "not handled", 0
новых лидов создано.

**Урок на будущее:** прежде чем поднимать polling против РЕАЛЬНОГО токена
бота (не заглушки), нужно было сначала спросить founder'а о существующем
членстве бота в чатах/группах, а не считать по умолчанию, что реальный
токен = чистый лид-канал только с личными сообщениями от клиентов. Реальные
внешние сервисы (боты, вебхуки) могут иметь накопленное состояние (backlog,
членство в чатах), не видимое из кода.

**Тесты:** `bot-leads/tests/test_forward_lead.py`, 8/8 зелёные (было 7, +1
`test_on_message_ignores_group_chats`), `ruff check` чисто.

**Docker:** новый сервис `bot-leads` в `docker-compose.yml`, аналогично
`bot`, но без внутреннего REST push-эндпоинта (только polling + forward).

**Что проверить founder'у вручную:** написать боту `@aidatacollector_bot` в
личные сообщения (не в группу) — должен прийти welcome-текст на `/start`, а
на любое следующее сообщение — лид должен появиться в CRM с
round-robin-назначенным owner'ом и ack-ответ "Спасибо! Заявка принята...".

## Интеграция сайта aisolution.uz → CRM (2026-07-08)
Отдельный репозиторий `~/Desktop/aisolution/aisolution website` (живой,
задеплоенный на Vercel + отдельный Django-бэкенд) — разрешение на точечную
правку получено явно (`[[code-exception-website]]`). Изменения строго
аддитивные, по согласованному плану:
- `backend/leads/services.py`: новая `send_to_crm(payload) -> (ok, error)`,
  тот же паттерн, что `send_to_telegram`/`send_email_fallback` — POST на
  `{CRM_API_URL}/leads/webhook/website`, поля source/service/language/
  company/consent уходят в `utm` (как и Instagram/Facebook в самой CRM).
  Best-effort: любая ошибка только логируется (`logger.warning`), не влияет
  на существующий статус доставки (delivered/partial/failed).
- `backend/leads/views.py`: один вызов `send_to_crm(data)` добавлен в
  `_process_submission()` рядом с существующими telegram/email вызовами —
  существующая логика статусов не тронута.
- `backend/.env.example` + локальный `backend/.env` (gitignored): новая
  `CRM_API_URL` (локально `http://localhost:8000`).
- Проверено: `send_to_crm()` вызвана напрямую (без полного Django dev-server —
  локальная Postgres-роль для этого проекта не настроена на этой машине,
  а сам сервис не зависит от Django ORM) против живого docker-compose CRM —
  лид успешно создан (`ok=True`), проверен в БД со всеми полями и utm,
  затем удалён как тестовые данные.
- Закоммичено локально в ветке `main` (родная ветка этого репо), **не
  запушено** — прод-деплой (push + настройка `CRM_API_URL` на хостинге
  Django-бэкенда) требует отдельного подтверждения founder'а.

**Не забыть:** production Django-бэкенд не сможет достучаться до
`localhost:8000` — для реального прод-трафика нужен публичный URL CRM
backend (сейчас CRM крутится только локально через docker-compose на этой
машине) плюс `CRM_API_URL`, выставленный в переменных окружения хостинга
Django-бэкенда, а не только в локальном `.env`.
