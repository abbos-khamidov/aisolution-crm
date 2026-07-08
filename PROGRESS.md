# PROGRESS.md — aisolutioncrm

## Что проверить в первую очередь
- Ничего не заблокировано на момент последнего обновления. Все self-check пункты
  фазы 0 пройдены реально (команды и вывод — см. "Decisions & Assumptions" и git log
  в ветке `dev`).
- Единственное сознательное отклонение от acceptance-критерия: `docker-compose up`
  не запускался вживую (Docker не установлен на машине, где шла разработка) — см.
  пункт про Docker ниже.
- **Фаза 5, важно:** acceptance-критерий "таска реально доходит студенту в
  Telegram (тестовый бот/чат)" НЕ проверен end-to-end с реальным Telegram —
  в dev-песочнице нет реального `BOT_TOKEN` (создаётся через @BotFather, это
  шаг, который может сделать только человек с Telegram-аккаунтом). Код бота
  и push/complete flow проверены иначе (юнит-тесты с моками aiohttp/httpx —
  см. Decisions фазы 5). Founder должен один раз: создать бота через
  @BotFather → положить токен в `bot/.env` → поднять `docker-compose up` →
  создать таску с исполнителем, у которого проставлен `telegram_id` → вручную
  убедиться, что сообщение с кнопкой пришло и "Готово" реально меняет статус.

## Текущая фаза
Фаза 6: Роли и доступ (RBAC) — done.
Следующая: Фаза 7 — Аналитика.

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

## Decisions & Assumptions

- **[2026-07-08] Docker не установлен в среде разработки.** На машине, где шла
  автономная сборка, нет `docker`/`docker-compose` (только нативный Postgres 16
  через Homebrew). `docker-compose.yml` и оба `Dockerfile` написаны и статически
  корректны (проверены построчно), но live-прогон `docker-compose up` не
  выполнялся. Вместо этого self-check фазы 0 пройден через нативные инструменты:
  локальный Postgres (роль/БД `aisolutioncrm`/`aisolutioncrm_dev`), venv для
  backend, `npm run dev`/`build` для frontend. Founder должен прогнать
  `docker-compose up` вручную при первой возможности и завести issue, если
  что-то не сойдётся с native-прогоном (порты/env отличаются: compose слушает
  Postgres на 5433 снаружи, чтобы не конфликтовать с локальным Postgres на 5432).

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

## С чего продолжить следующую сессию
Фаза 7 (`BUILD_PHASES.md` раздел "Фаза 7 — Аналитика"): воронка (new→won/lost
с временем в каждом статусе), конверсия по source, разбивка по loss_reason,
revenue по клиенту/месяцу (уже частично есть в `/finance/summary`), нагрузка
команды, "дыры" (лиды без activity > N дней). Считать из `events` +
агрегатов, founder-only дашборд (уже есть паттерн `require_founder`). Открыть
`backend/app/api/`, добавить `analytics.py`.
