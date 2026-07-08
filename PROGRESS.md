# PROGRESS.md — aisolutioncrm

## Что проверить в первую очередь
- Ничего не заблокировано на момент последнего обновления. Все self-check пункты
  фазы 0 пройдены реально (команды и вывод — см. "Decisions & Assumptions" и git log
  в ветке `dev`).
- Единственное сознательное отклонение от acceptance-критерия: `docker-compose up`
  не запускался вживую (Docker не установлен на машине, где шла разработка) — см.
  пункт про Docker ниже.

## Текущая фаза
Фаза 1: Лиды и owner-логика — done.
Следующая: Фаза 2 — Клиенты и проекты.

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

## Known issues / TODO
- Docker-compose live run не проверен (см. Decisions выше) — проверить на
  реальной машине с установленным Docker/Colima перед деплоем.
- `POST /leads/webhook/website` не проверяет подпись/секрет запроса — открытый
  endpoint (как обычный webhook с сайта). Если станет проблемой (спам-лиды) —
  добавить shared-secret заголовок, не блокер для MVP.
- Frontend leads-страница — минимальный интерфейс без пагинации/сортировки
  (лидов пока мало). Не оптимизировано, т.к. вне acceptance-критериев фазы 1.

## С чего продолжить следующую сессию
Фаза 2 (`BUILD_PHASES.md` раздел "Фаза 2 — Клиенты и проекты"): конвертация
won-лида в client+project одним действием, CRUD projects (+ project_members
m2m), milestones, дашборд по дедлайну. Открыть `backend/app/api/`, добавить
`clients.py`/`projects.py`, миграцию `backend/alembic/versions/`.
