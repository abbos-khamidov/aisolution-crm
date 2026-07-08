# aisolutioncrm — Спецификация (Source of Truth)

Этот файл — единственный источник правды по продукту. CLAUDE.md и BUILD_PHASES.md ссылаются
на него. Если агент (Claude Code) видит противоречие между этим файлом и своей интерпретацией
из предыдущей сессии — правда здесь.

Одна платформа, один репозиторий, одно название — **aisolutioncrm**. Никаких отдельных
"модулей со своими именами" — лиды, проекты, финансы, файлы, таски и бот живут в одной системе.

## 0. Контекст

AI Solution — B2B AI-automation агентство (Ташкент, CIS). Основатель ведёт лиды силами 3 человек
без разделения обязанностей → путаница кто чей клиент, кто отправляет КП. Отдельно — обучает
студентов, которым нужно давать таски через Telegram-бота с трекингом выполнения.

Стратегическая цель: **продажа компании через 5 лет**. Из этого вытекает жёсткое требование —
любое действие в системе должно быть залогировано (кто/когда/что), потому что due diligence
покупателя будет смотреть на историю, а не на текущее состояние.

## 1. Хардовые constraints (не обсуждаются, не "оптимизируются" агентом)

1. **Один лид = один owner.** Пока owner не назначен — лид в общей очереди, никто кроме founder
   не может менять его статус. Как только owner назначен — писать в лид (звонок/статус/КП)
   может только owner или founder. Это API-level constraint, не UI-подсказка.
2. **Ничего не удаляется.** Soft delete везде (`deleted_at`), event log append-only.
3. **Единый event log** для всей истории (см. раздел 3, таблица `events`). Не плодить отдельные
   `*_activity_log` таблицы под каждую сущность.
4. **Роли закладываются в схему с фазы 0**, но полноценный RBAC — фаза 6. До этого — два уровня:
   founder (всё) и everyone else (то, что назначено).

## 2. Стек

- Frontend: Next.js 14 (App Router), TypeScript, Tailwind — как на aisolution.uz.
- Backend: FastAPI + asyncpg (уже основной стек Абаса, не Node backend).
- DB: PostgreSQL. Без pgvector/AI-фич на старте — это отдельный разговор, если понадобится позже
  (см. раздел 7).
- Bot: aiogram3, отдельный процесс, интеграция с CRM через внутренний REST endpoint
  (не через прямые SQL-запросы бота в CRM-таблицы).
- Auth: JWT (access+refresh), bcrypt/argon2 для паролей команды. Студенты логинятся
  преимущественно через Telegram (deep link + одноразовый токен), не через пароль.
- Деплой: Hetzner VPS (тот же, `aisolution-main`), отдельный PM2-процесс от основного сайта,
  отдельная БД/схема — не шарить БД с публичным сайтом.
- Файлы: S3-совместимое хранилище (Hetzner Object Storage или локально на VPS с бэкапом) —
  не хранить бинарники в Postgres.

## 3. Данные (ER, укрупнённо)

```
users
  id, name, phone, email, telegram_id, role (founder|manager|developer|student),
  is_active, created_at, deleted_at

leads
  id, source (website|instagram|telegram|facebook|referral|other),
  name, phone, email, message, utm jsonb,
  status (new|contacted|qualified|proposal_sent|won|lost),
  owner_id -> users (nullable = в общей очереди),
  loss_reason (nullable, обязателен при status=lost),
  created_at, first_response_at, deleted_at

clients
  id, lead_id -> leads (nullable), name, company_name, contact_info jsonb, created_at

projects
  id, client_id -> clients, name, description,
  stage (discovery|proposal|contract|in_progress|review|completed|paused|cancelled),
  owner_id -> users, start_date, deadline, budget_total, currency,
  created_at, deleted_at

project_members (m2m: projects <-> users)
  project_id, user_id, role_on_project (lead|contributor)

milestones
  id, project_id -> projects, title, due_date, status (pending|done|overdue),
  deliverable_file_id -> files (nullable)

finance_entries
  id, project_id -> projects, type (invoice|payment|expense),
  amount, currency, status (pending|paid|overdue),
  due_date, paid_at, description, created_at

files
  id, project_id -> projects (nullable), lead_id -> leads (nullable),
  uploaded_by -> users, url, status (pending_review|approved|rejected),
  reviewed_by -> users (nullable), reviewed_at, comment, created_at

tasks
  id, project_id -> projects (nullable), assigned_to -> users, created_by -> users,
  title, description, status (todo|in_progress|done|blocked),
  due_date, telegram_message_id (nullable, для sync с ботом),
  completed_at, created_at

events   -- ЕДИНЫЙ append-only лог для всей истории компании
  id, entity_type (lead|project|task|file|finance_entry),
  entity_id, actor_id -> users (nullable, если система/бот),
  event_type (created|status_changed|assigned|note_added|approved|rejected|comment|...),
  payload jsonb, created_at
```

Правило: если агент хочет добавить новую таблицу — сначала проверяет, не решается ли это
записью в `events` или полем в существующей таблице. Новая таблица = запись в `PROGRESS.md`
разделе "Decisions" с обоснованием.

## 4. Ключевые сценарии

**Входящий лид (фаза 1—2, канал website):**
Webhook с сайта → `POST /leads` (source=website) → лид создаётся со status=new, owner_id=null →
событие `created` в `events` → лид виден в общей очереди всем manager-ролям.

**Claim / назначение:**
Manager жмёт "взять в работу" → owner_id устанавливается → событие `assigned` → с этого момента
API отклоняет попытки других manager'ов менять этот лид (403), founder может переназначить всегда.

**Отказ:**
Manager переводит status=lost → `loss_reason` обязателен (enum + свободный текст) → событие
`status_changed` с payload {from, to, reason}. Это основа аналитики "где дыры".

**КП (commercial proposal):**
Отправка КП — не отдельная таблица, а `files` (type подразумевается по контексту) + событие
`status_changed` в proposal_sent + timestamp. Кто отправил — `actor_id` в event, снимает вопрос
"кто должен был отправить КП".

**Файлы на согласование:**
Загрузка → status=pending_review → founder approve/reject через веб или (фаза 5) через бота →
событие `approved`/`rejected`.

**Таски студентам через бота:**
Founder создаёт `task` в CRM → CRM пушит в бота (внутренний endpoint) → бот шлёт студенту
сообщение с inline-кнопкой "Готово" → студент жмёт → бот дергает CRM API → task.status=done,
completed_at заполняется → событие `status_changed`. Founder видит дашборд "кто просрочил".

## 5. Аналитика (фаза 7, но поля закладываем раньше)

- Воронка: new → contacted → qualified → proposal_sent → won/lost, время в каждом статусе.
- Конверсия по source (website/ig/tg/fb).
- Разбивка по loss_reason.
- Активные проекты: dashboard с цветовой индикацией по дедлайну (green/yellow/red).
- Revenue: invoiced vs paid, по клиенту, по месяцу.
- Нагрузка команды: задач на человека, просроченные задачи.
- "Дыры": лиды без activity > N дней в одном статусе → флаг в дашборде.

Всё это считается из `events` + агрегатных таблиц, не из отдельного "analytics service" на
старте — не усложнять раньше времени.

## 6. Роли (схема с фазы 0, логика с фазы 6)

- **founder** — всё видит, всё может, единственный approver файлов/КП/чатбот-действий.
- **manager** — свои лиды (owner_id=self) + назначенные проекты.
- **developer** — назначенные проекты/таски.
- **student** — только назначенные таски, доступ преимущественно через Telegram, веб — read-only
  минимальный (список своих тасков).

## 7. Явно НЕ делаем сейчас

- **AI/чатбот внутри CRM — вне скоупа.** Не проектируем, не закладываем таблицы под него.
  Если понадобится позже — это отдельная надстройка поверх готового `events`-лога
  (RAG на истории проекта), не блокер для MVP и не повод усложнять схему сейчас.
- Instagram/Telegram/Facebook lead ingestion — только website. Остальные каналы фаза 8,
  схема `leads.source` уже это предусматривает, просто webhook'и добавятся позже.
- Полноценный RBAC с permission-таблицами — фаза 6.
- Автоматический round-robin назначения лидов — ручное назначение founder'ом до отдельного решения.
