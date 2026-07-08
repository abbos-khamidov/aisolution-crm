const MORNING = [
  "Доброе утро. Пока ты спал, лиды не спали.",
  "Утро. Кофе в одну руку, очередь лидов — в другую.",
];
const DAY = [
  "Добрый день. Где-то там клиент ждёт ответа дольше, чем думает.",
  "День в разгаре — самое время закрыть пару сделок.",
];
const EVENING = [
  "Добрый вечер. Ещё один звонок, и можно домой.",
  "Вечер — хорошее время добить дедлайны, которые горят красным.",
];
const NIGHT = [
  "Полночь — а CRM всё ещё на связи. Уважаем, но иди спать.",
  "Ночная смена? Уважаем твою продуктивность.",
];

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return pick(MORNING);
  if (hour >= 12 && hour < 18) return pick(DAY);
  if (hour >= 18 && hour < 23) return pick(EVENING);
  return pick(NIGHT);
}
