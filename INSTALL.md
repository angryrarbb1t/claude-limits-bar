# Установка limits-bar — инструкция для ИИ-агента

Ты — агент в Claude Code. Пользователь попросил поставить плагин limits-bar: это полоски лимитов подписки над полем ввода. Выполни шаги по порядку и в конце коротко отчитайся.

1. **Версия.** Выполни `claude --version`. Нужна 2.1.299 или новее. Если версия старше, обнови Claude Code (`claude update`) и проверь версию снова.

2. **Установка.**
   ```bash
   claude plugin marketplace add volodyatoxic/claude-limits-bar && claude plugin install limits-bar@claude-limits-bar
   ```
   Если маркетплейс уже добавлен, обнови его и плагин:
   ```bash
   claude plugin marketplace update claude-limits-bar && claude plugin update limits-bar@claude-limits-bar
   ```

3. **Автообновление.** Открой `~/.claude/settings.json`. В разделе `extraKnownMarketplaces` у записи `claude-limits-bar` должно быть поле `"autoUpdate": true`. Если записи нет, добавь её целиком:
   ```json
   "claude-limits-bar": {
     "source": { "source": "github", "repo": "volodyatoxic/claude-limits-bar" },
     "autoUpdate": true
   }
   ```
   Остальные настройки не трогай. После правки проверь, что JSON валидный.

4. **Проверка.** В том же файле в `enabledPlugins` должна быть строка `"limits-bar@claude-limits-bar": true`.

5. **Готово.** Скажи пользователю:
   - перезапустить Claude Code или набрать `/reload-plugins`;
   - полоски появятся после первого ответа в чате;
   - нужна подписка Claude Pro или Max: при входе по API-ключу лимитов нет, и полоски не появятся;
   - новые версии подтянутся сами при запуске Claude Code.

Описание плагина и настройки — в [README.md](README.md).
