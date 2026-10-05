import React from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
import type { IpcSnapshot } from '../../shared/contracts';

type Column = IpcSnapshot['columns'][number];
type DragContextProps = {
  columns: readonly Column[];
  tasks: IpcSnapshot['tasks'];
  children: React.ReactNode;
  onMove: (taskId: string, column: Column) => void;
};

export function BoardDragContext({
  columns,
  tasks,
  children,
  onMove,
}: DragContextProps): React.JSX.Element {
  const keyboardTarget = React.useRef<string | undefined>(undefined);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, args) =>
        boardColumnKeyboardCoordinates(event, args, tasks, keyboardTarget),
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollisionDetection}
      onDragStart={() => {
        keyboardTarget.current = undefined;
      }}
      onDragEnd={(event) => {
        finishBoardDrag(event, columns, onMove, keyboardTarget.current);
        keyboardTarget.current = undefined;
      }}
    >
      {children}
    </DndContext>
  );
}

function boardColumnKeyboardCoordinates(
  event: KeyboardEvent,
  { active, context }: Parameters<KeyboardCoordinateGetter>[1],
  tasks: IpcSnapshot['tasks'],
  keyboardTarget: React.RefObject<string | undefined>,
): { x: number; y: number } | undefined {
  if (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft') return;
  const activeTaskId = readDndId(active, 'task:');
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const sourceId =
    keyboardTarget.current ??
    context.over?.id ??
    (activeTask ? `column:${activeTask.columnId}` : undefined);
  const containers = context.droppableContainers.getEnabled();
  const currentIndex = containers.findIndex(
    (container) => container.id === sourceId,
  );
  const target =
    containers[currentIndex + (event.code === 'ArrowRight' ? 1 : -1)];
  if (!target) return;
  keyboardTarget.current = String(target.id);
  const rect = context.droppableRects.get(target.id);
  if (!rect) return;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length ? pointerCollisions : closestCenter(args);
};
function finishBoardDrag(
  event: DragEndEvent,
  columns: readonly Column[],
  onMove: DragContextProps['onMove'],
  keyboardTargetId: string | undefined,
): void {
  const taskId = readDndId(event.active.id, 'task:');
  const droppedId =
    event.activatorEvent.type === 'keydown' ? keyboardTargetId : event.over?.id;
  const columnId = droppedId ? readDndId(droppedId, 'column:') : undefined;
  const column = columns.find((item) => item.id === columnId);
  if (taskId && column) onMove(taskId, column);
}

function readDndId(value: string | number, prefix: string): string | undefined {
  const id = String(value);
  return id.startsWith(prefix) ? id.slice(prefix.length) : undefined;
}

export function BoardDroppableColumn({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: `column:${id}` });
  return (
    <section
      ref={setNodeRef}
      className={className}
      aria-label={label}
      data-drop-active={isOver || undefined}
    >
      {children}
    </section>
  );
}

export function BoardDraggableTask({
  id,
  className,
  label,
  children,
}: {
  id: string;
  className: string;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `task:${id}`,
    });
  const style = transform
    ? {
        transform: `translate3d(${transform.x.toString()}px, ${transform.y.toString()}px, 0)`,
      }
    : undefined;
  return (
    <article
      ref={setNodeRef}
      className={className}
      style={style}
      {...attributes}
      {...listeners}
      role="article"
      aria-roledescription="перетаскиваемая карточка"
      aria-label={label}
      data-dragging={isDragging || undefined}
    >
      {children}
    </article>
  );
}
