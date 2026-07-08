# PROGRESS.md — aisolutioncrm

## Что проверить в первую очередь
- Ничего не заблокировано на момент последнего обновления. Все self-check пункты
  фазы 0 пройдены реально (команды и вывод — см. "Decisions & Assumptions" и git log
  в ветке `dev`).
- Единственное сознательное отклонение от acceptance-критерия: `docker-compose up`
  не запускался вживую (Docker не установлен на машине, где шла разработка) — см.
  пункт про Docker ниже.

## Текущая фаза
Фаза 0: Фундамент — done (с одной зафиксированной оговоркой, см. ниже).
Следующая: Фаза 1 — Лиды и owner-логика.

## Завершено
- Фаза 0: monorepo (`/backend`, `/frontend`), первая Alembic-миграция (`users`,
  `events`), JWT auth (`/auth/login`, `/auth/refresh`), CI (ruff + eslint + tsc +
  next build), docker-compose.yml + Dockerfile'ы, seed-скрипт для founder'а.

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

## Known issues / TODO
- Docker-compose live run не проверен (см. Decisions выше) — проверить на
  реальной машине с установленным Docker/Colima перед деплоем.
- Тестов (pytest) для фазы 0 нет — явно не требовались acceptance-критериями;
  первый реальный тест появится в фазе 1 (concurrency-тест на claim лида,
  обязателен по BUILD_PHASES.md).

## С чего продолжить следующую сессию
Фаза 1 (`BUILD_PHASES.md` раздел "Фаза 1"): таблица `leads`, webhook,
claim/PATCH с owner-логикой, events, concurrency-тест. Открыть
`backend/app/api/`, добавить `leads.py`, миграцию
`backend/alembic/versions/`.
