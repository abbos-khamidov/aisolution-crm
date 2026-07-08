BUILD_PHASES.md — aisolutioncrm

Копипаст-промпты для Claude Code, по одной фазе за раз. Не давай агенту весь файл сразу —
только промпт текущей фазы. Между фазами — сам проверяй результат (не только доверяй self-check
агента), особенно фазу 0 (схема БД) и фазу 1 (owner-логика) — это фундамент, ошибка здесь
дорого стоит на фазе 5+.

Перед фазой 0 положи в репозиторий: CRM_SPEC.md, CLAUDE.md. Дальше агент сам создаст
PROGRESS.md.


Фаза 0 — Фундамент

Прочитай CRM_SPEC.md и CLAUDE.md полностью перед началом.

Создай фундамент aisolutioncrm:
1. Monorepo: /backend (FastAPI + asyncpg + Alembic), /frontend (Next.js 14 App Router + TS + Tailwind).
2. docker-compose.yml для локальной разработки: postgres + backend + frontend.
3. Первая миграция Alembic: таблицы users и events из раздела 3 CRM_SPEC.md. Только эти две —
   остальные таблицы придут в следующих фазах, не создавай их заранее. ВАЖНО: entity_type в
   events — text + CHECK constraint, НЕ native Postgres ENUM (см. правило в CRM_SPEC.md
   раздел 3) — это обязательно, не оптимизация на потом.
4. Seed-скрипт `scripts/create_founder.py` (или Alembic data-миграция, если предпочитаешь —
   но не хардкодь реальные персональные данные в файл миграции, читай email/phone/password
   из переменных окружения). Скрипт должен быть идемпотентным — повторный запуск не должен
   падать или дублировать founder'а. Без этого шага acceptance-критерий "login возвращает JWT"
   непроверяем на чистой БД.
5. Базовый JWT auth: login, refresh, middleware проверки роли (пока только founder/other,
   полноценный RBAC — фаза 6).
6. CI: lint (ruff для backend, eslint для frontend) + typecheck, GitHub Actions.
7. Создай PROGRESS.md по шаблону из CLAUDE.md.

Acceptance criteria:
- `docker-compose up` поднимает всё с нуля без ручных шагов.
- `alembic upgrade head` отрабатывает на чистой БД.
- Seed-скрипт создаёт founder'а на чистой БД, повторный запуск не ломается.
- POST /auth/login с seed-founder'ом возвращает JWT.
- CI зелёный на пустом коммите.

Пройди self-check из CLAUDE.md перед тем, как сказать "готово". Обнови PROGRESS.md.


Фаза 1 — Лиды и owner-логика (ядро, самая важная фаза)

Прочитай PROGRESS.md — убедись, что фаза 0 реально завершена, прежде чем продолжать.

Реализуй управление лидами из CRM_SPEC.md разделов 3-4:
1. Таблица leads (только source=website и manual пока, остальные source-значения в enum
   заложи, но webhook'и под них не делай — это фаза 8).
2. POST /leads/webhook/website — приём лида с сайта, создание со status=new, owner_id=null,
   событие created в events.
3. GET /leads — список с фильтрами по status/source/owner.
4. POST /leads/{id}/claim — назначение owner_id=текущий пользователь. ВАЖНО: если owner_id
   уже установлен и текущий пользователь не founder — 409, не молча перезаписывать.
5. PATCH /leads/{id} — смена status/заметки. ВАЖНО: если owner_id установлен и текущий
   пользователь не owner и не founder — 403. Это hard constraint из CRM_SPEC.md, не смягчать.
6. При status=lost — loss_reason обязателен в теле запроса, без него 400.
7. Каждое изменение — событие в events (created/assigned/status_changed) с actor_id и payload.
8. Frontend: страница списка лидов (общая очередь + "мои лиды"), кнопка "взять в работу",
   форма смены статуса с обязательным loss_reason при отказе.

Acceptance criteria:
- Два разных пользователя не могут одновременно писать в один лид после claim — второй
  получает 403/409, не тихий overwrite.
- Лид без owner виден всем в очереди.
- Отказ без loss_reason возвращает 400.
- В events реально видна вся история конкретного лида (created → assigned → status_changed).

Self-check из CLAUDE.md, обнови PROGRESS.md. Особо проверь пункт про concurrent-запись —
напиши для этого тест, не полагайся на ручную проверку.


Фаза 2 — Клиенты и проекты

Прочитай PROGRESS.md.

Реализуй clients и projects из CRM_SPEC.md раздел 3-4:
1. Конвертация won-лида в client + project (один экшн, не два ручных шага).
2. CRUD projects: stage, deadline, budget_total, owner_id, project_members (m2m).
3. milestones: title, due_date, status, привязка к project.
4. Frontend: дашборд активных проектов с цветовой индикацией по дедлайну (green/yellow/red —
   правило: yellow если due_date <7 дней, red если просрочен).
5. Каждое изменение project/milestone — событие в events.

Acceptance criteria:
- Won-лид одной операцией превращается в client+project, сохраняя связь с исходным lead_id.
- Дашборд корректно красит проекты по дедлайну.
- История проекта видна через events.

Self-check, обнови PROGRESS.md.


Фаза 3 — Финансы

Прочитай PROGRESS.md.

Реализуй finance_entries из CRM_SPEC.md:
1. CRUD: type (invoice/payment/expense), amount, currency, status, due_date, paid_at.
2. Привязка к project.
3. Простой дашборд: invoiced vs paid по клиенту и по месяцу.
4. events для каждой финансовой записи.

Acceptance criteria:
- Дашборд корректно считает invoiced/paid/overdue.
- Смена статуса invoice на paid требует paid_at (не может быть paid без даты).

Self-check, обнови PROGRESS.md.


Фаза 4 — Файлы и согласование

Прочитай PROGRESS.md.

Реализуй files из CRM_SPEC.md:
1. Загрузка файла (S3-совместимое хранилище, не бинарник в Postgres) — привязка к project
   или lead, status=pending_review.
2. Founder approve/reject с комментарием.
3. events для upload/approved/rejected.
4. Frontend: очередь файлов на согласование, видна только founder (или всем, но действие
   approve/reject — только founder, см. CRM_SPEC.md раздел 6).

Acceptance criteria:
- Не-founder не может approve/reject (403).
- История согласования файла видна через events.

Self-check, обнови PROGRESS.md.


Фаза 5 — Таски и интеграция с Telegram-ботом

Прочитай PROGRESS.md.

Реализуй tasks + связь с ботом из CRM_SPEC.md:
1. CRUD tasks: assigned_to, created_by, due_date, status.
2. Внутренний REST endpoint для бота: получить новые таски для конкретного telegram_id,
   отметить task как done (бот дёргает этот endpoint, не пишет в БД напрямую).
3. aiogram3-бот (отдельный процесс): при создании таски — пуш студенту с inline-кнопкой
   "Готово"; по нажатию — вызов CRM endpoint, обновление task.status=done, completed_at.
4. Дашборд "кто просрочил": таски с due_date < сегодня и status != done, группировка по
   assigned_to.
5. events для создания/завершения таски.

Acceptance criteria:
- Таска, созданная в CRM, реально доходит студенту в Telegram (тестовый бот/чат).
- Нажатие "Готово" в боте меняет статус в CRM в течение секунд, не требует ручного sync.
- Дашборд просрочек корректно фильтрует.

Self-check, обнови PROGRESS.md.


Фаза 6 — Роли и доступ (RBAC)

Прочитай PROGRESS.md.

Реализуй полноценные роли из CRM_SPEC.md раздел 6: founder / manager / developer / student.
1. Permission-мидлварь по ролям на все эндпоинты фаз 1-5 (не только founder/other как в фазе 0).
2. Student-портал: только свои таски, read-only, вход преимущественно через Telegram deep-link
   + одноразовый токен (не пароль).
3. Manager: видит только свои лиды (owner_id=self) + назначенные проекты.
4. Developer: назначенные проекты/таски.
5. Ревизия всех эндпоинтов фаз 1-5 — убедись, что старая логика "founder/other" нигде не
   осталась как дыра в доступе.

Acceptance criteria:
- Student не может открыть чужие таски или лиды ни через UI, ни прямым запросом к API.
- Manager не видит чужие лиды в своём дашборде (кроме общей очереди unclaimed).

Self-check — здесь особенно важно: пройдись по каждому эндпоинту всех предыдущих фаз и
проверь permission, не только новые. Обнови PROGRESS.md.


Фаза 7 — Аналитика

Прочитай PROGRESS.md.

Реализуй аналитику из CRM_SPEC.md раздел 5, считая из events + агрегатов:
1. Воронка: new → contacted → qualified → proposal_sent → won/lost, время в каждом статусе.
2. Конверсия по source.
3. Разбивка по loss_reason.
4. Revenue по клиенту/по месяцу (invoiced vs paid).
5. Нагрузка команды: задач на человека, просроченные.
6. "Дыры": лиды без activity > N дней в одном статусе (N — настраиваемый параметр, дефолт 7).

Acceptance criteria:
- Все цифры проверяемы вручную по events на тестовых данных (не просто "выглядит правильно").
- Дашборд доступен только founder.

Self-check, обнови PROGRESS.md.


Фаза 8 — Доп. каналы лидов (Instagram / Telegram / Facebook)

Прочитай PROGRESS.md.

Расширь ingestion лидов из CRM_SPEC.md раздел 7:
1. Webhook-эндпоинты для Instagram/Telegram/Facebook — маппинг в ту же таблицу leads,
   тот же flow claim/owner, что и для website (фаза 1). Не создавай отдельную логику
   на канал — только разный парсинг входящего payload в общую схему.
2. utm/source-специфичные поля — в jsonb utm, не новые колонки.

Acceptance criteria:
- Лид с любого канала проходит тот же claim/owner/status flow, что и website-лид.
- Источник виден в аналитике фазы 7 без доработок дашборда.

Self-check, обнови PROGRESS.md.


Напоминание на каждую фазу

Не давай агенту сразу несколько фаз за раз, даже если кажется, что времени хватит — именно
здесь агенты теряют консистентность. Одна фаза → self-check → твоя ручная проверка hard
constraints → следующая фаза.
