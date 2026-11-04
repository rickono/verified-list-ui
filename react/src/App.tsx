// Renderer for the compiled XState machine. It holds no list logic: XState
// runs the generated config, and this component copies the current state's
// `meta` (the proved Rocq view) into the DOM and forwards clicks as events.
// Row buttons send the event name stored in their row; Delete and Reset send
// the two fixed event names the compiler uses.
import { createMachine } from "xstate";
import { useMachine } from "@xstate/react";
import config from "@machine";

type Row = { id: number; label: string; selected: boolean; selectEvent: string };
type View = { rows: Row[]; deleteEnabled: boolean; showEmptyMessage: boolean };

const machine = createMachine(config as Parameters<typeof createMachine>[0]);

export function App() {
  const [snapshot, send] = useMachine(machine);
  const key = `${config.id}.${String(snapshot.value)}`;
  const view = snapshot.getMeta()[key] as View | undefined;
  if (!view) throw new Error(`verified-list-ui: no meta for ${key}`);

  return (
    <main>
      <h1>Verified list</h1>
      <p className="hint">Select an item, then delete it. Reset restores the three starting items.</p>
      <ul id="items" aria-label="Items">
        {view.rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={r.selected ? "row selected" : "row"}
              aria-pressed={r.selected}
              data-id={r.id}
              onClick={() => send({ type: r.selectEvent })}
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>
      <p id="empty" hidden={!view.showEmptyMessage}>No items left.</p>
      <div className="actions">
        <button
          type="button"
          id="delete"
          disabled={!view.deleteEnabled}
          onClick={() => send({ type: "DELETE_SELECTED" })}
        >
          Delete selected
        </button>
        <button type="button" id="reset" onClick={() => send({ type: "RESET" })}>
          Reset
        </button>
      </div>
    </main>
  );
}
