import React from 'react';
import type { Task } from '../../domain';
import type { AiMode, ChatModel } from '../chat/use-chat';
import { ChatTurnView } from './chat-turn';

interface ChatScreenProps {
  readonly tasks: readonly Task[];
  readonly chat: ChatModel;
}

export function ChatScreen({
  tasks,
  chat,
}: ChatScreenProps): React.JSX.Element {
  const { loadMode } = chat;
  React.useEffect(loadMode, [loadMode]);
  const [text, setText] = React.useState('');
  const submit = (): void => {
    if (text.trim() === '' || chat.running) return;
    chat.send(text);
    setText('');
  };
  return (
    <section className="chat-screen" aria-labelledby="chat-heading">
      <header className="chat-head">
        <h2 id="chat-heading">Чат с AI</h2>
        <label className="chat-mode">
          Режим AI
          <select
            value={chat.mode}
            onChange={(event) => {
              chat.setMode(event.target.value as AiMode);
            }}
          >
            <option value="confirm">С подтверждением</option>
            <option value="auto">Авто</option>
          </select>
        </label>
      </header>
      {chat.modeError && (
        <p role="alert" className="chat-error">
          {chat.modeError}
        </p>
      )}
      <p className="chat-intro">
        Опишите дела текстом — AI предложит карточки. AI работает только по
        вашему запросу и ничего не меняет без правил проверки.
      </p>
      <ol className="chat-turns" aria-label="Диалог">
        {chat.turns.map((turn) => (
          <ChatTurnView key={turn.id} turn={turn} tasks={tasks} chat={chat} />
        ))}
      </ol>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label="Сообщение помощнику"
          placeholder="Например: подготовить доклад к пятнице"
          rows={3}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          className="button primary"
          type="submit"
          disabled={chat.running || text.trim() === ''}
        >
          Отправить
        </button>
      </form>
    </section>
  );
}
