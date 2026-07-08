# PROGRESS.md — aisolutioncrm

## Что проверить в первую очередь
- Ничего не заблокировано на момент последнего обновления. Все self-check пункты
  фазы 0 пройдены реально (команды и вывод — см. "Decisions & Assumptions" и git log
  в ветке `dev`).
- Единственное сознательное отклонение от acceptance-критерия: `docker-compose up`
  не запускался вживую (Docker не установлен на машине, где шла разработка) — см.
  пункт про Docker ниже.

## Текущая фаза
Фаза 2: Клиенты и проекты — done.
Следующая: Фаза 3 — Финансы.

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

## С чего продолжить следующую сессию
Фаза 3 (`BUILD_PHASES.md` раздел "Фаза 3 — Финансы"): `finance_entries` CRUD
(invoice/payment/expense), привязка к project, дашборд invoiced/paid/overdue,
события. Открыть `backend/app/api/`, добавить `finance.py`, миграцию
`backend/alembic/versions/`.
