import { useDraggable, useDroppable } from "@dnd-kit/core";

// ─── Draggable Appointment Wrapper ───────────────────────────────────
export function DraggableAppointment({
  id,
  disabled,
  children,
}: {
  id: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ position: "relative" }}
    >
      {children}
    </div>
  );
}

// ─── Droppable Cell (one per hour per staff column) ──────────────────
export function DroppableCell({
  dropId,
  className,
  style,
  onClick,
  children,
}: {
  dropId: string;
  className: string;
  style: React.CSSProperties;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "bg-blue-50/60" : ""}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ─── Droppable Quarter (15-min subdivision within a cell) ────────────
export function DroppableQuarter({
  dropId,
  quarter,
  hourHeight,
}: {
  dropId: string;
  quarter: number;
  hourHeight: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const quarterHeight = hourHeight / 4;

  return (
    <div
      ref={setNodeRef}
      className={`absolute left-0 right-0 z-0 ${isOver ? "bg-blue-100/40 border-t border-blue-300/50" : ""}`}
      style={{
        top: quarter * quarterHeight,
        height: quarterHeight,
      }}
    />
  );
}
