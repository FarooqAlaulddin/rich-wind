export function PaneResizer({ onPointerDown }) {
  return <div class="pane-resizer" onPointerDown={onPointerDown} aria-hidden="true" />;
}
