// Renderer for the capped counter. Everything it shows comes from the
// generated machine: the numbers from snapshot.context, the lock status
// from the state's meta, and whether each button is enabled from
// snapshot.can(event). It decides nothing itself except parsing the
// amount field into a non-negative integer.
import { useState } from "react";
import { useMachine } from "@xstate/react";
import { machine } from "@counter";

type Context = { count: number; changes: number; limit: number };
type Meta = { locked: boolean };
type Event = { type: "ADD" | "SUB"; n: number } | { type: "RESET" | "LOCK" | "UNLOCK" };

const steps = [100, 10, 1];

export function Counter() {
  const [snapshot, send] = useMachine(machine);
  const [amount, setAmount] = useState("250");
  const { count, changes, limit } = snapshot.context as Context;
  const key = `${machine.id}.${String(snapshot.value)}`;
  const meta = snapshot.getMeta()[key] as Meta | undefined;
  if (!meta) throw new Error(`verified-list-ui: no meta for ${key}`);

  const n = /^\d{1,15}$/.test(amount) ? Number(amount) : null;
  const button = (label: string, event: Event | null, id?: string) => (
    <button type="button" id={id} disabled={!event || !snapshot.can(event)} onClick={() => event && send(event)}>
      {label}
    </button>
  );

  return (
    <main>
      <h1>Capped counter</h1>
      <p className="hint">The count is proved to stay below the limit, for any events.</p>
      <p className="status" id="status">{meta.locked ? "Locked" : "Unlocked"}</p>
      <p className="count">
        <output id="count">{count}</output> <span className="of">/ <span id="limit">{limit}</span></span>
      </p>
      <meter id="meter" min={0} max={limit} value={count} />
      <p className="hint">
        Changes since reset: <span id="changes">{changes}</span>
      </p>
      <div className="steps">
        {steps.map((s) => <span key={`sub${s}`}>{button(`−${s}`, { type: "SUB", n: s })}</span>)}
        {[...steps].reverse().map((s) => <span key={`add${s}`}>{button(`+${s}`, { type: "ADD", n: s })}</span>)}
      </div>
      <div className="amount">
        <label>
          Amount <input id="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {button("Add amount", n === null ? null : { type: "ADD", n })}
        {button("Subtract amount", n === null ? null : { type: "SUB", n })}
      </div>
      <div className="actions">
        {button("Reset", { type: "RESET" })}
        {button("Lock", { type: "LOCK" })}
        {button("Unlock", { type: "UNLOCK" })}
      </div>
    </main>
  );
}
