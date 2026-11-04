// Renderer for the Foldkit counter. The model, update, the save command,
// and restoring at start-up all come from the printed program
// (theories/CounterFold.v through theories/FoldTs.v). The view shows the
// model and enables each button exactly when can(model, message) holds.
// It decides nothing itself except reading the amount field: 1 to 15
// digits become ChangedAmount, anything else ClearedAmount.
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { Runtime } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { Message, Model, can, flags, init, initialModel, limit, update } from "@program";
import "../../browser/styles.css";
import "../../react/src/counter.css";

const steps = [100, 10, 1];

const readAmount = (text: string): Message =>
  /^\d{1,15}$/.test(text) ? Message.ChangedAmount({ n: Number(text) }) : Message.ClearedAmount();

const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const button = (label: string, message: Message | null) =>
    h.button(
      [
        h.Type("button"),
        h.Disabled(message === null || !can(model, message)),
        ...(message === null ? [] : [h.OnClick(message)]),
      ],
      [label],
    );
  const amount = model.amountOk ? model.amount : null;
  return {
    title: "Capped counter (Foldkit)",
    body: h.main(
      [],
      [
        h.h1([], ["Capped counter"]),
        h.p([h.Class("hint")], [
          "The count is proved to stay below the limit, for any messages. It is saved in this browser.",
        ]),
        h.p([h.Class("status"), h.Id("status")], [model.locked ? "Locked" : "Unlocked"]),
        h.p([h.Class("count")], [
          h.output([h.Id("count")], [String(model.count)]),
          " ",
          h.span([h.Class("of")], ["/ ", h.span([h.Id("limit")], [String(limit)])]),
        ]),
        h.meter([h.Id("meter"), h.Min("0"), h.Max(String(limit)), h.Value(String(model.count))], []),
        h.p([h.Class("hint")], ["Changes since reset: ", h.span([h.Id("changes")], [String(model.changes)])]),
        h.div([h.Class("steps")], [
          ...steps.map((s) => button(`−${s}`, Message.ClickedSubtract({ n: s }))),
          ...[...steps].reverse().map((s) => button(`+${s}`, Message.ClickedAdd({ n: s }))),
        ]),
        h.div([h.Class("amount")], [
          h.label([], [
            "Amount ",
            // Not bound to the model: the field keeps what was typed, and the
            // model keeps the last number read from it (amount, amountOk).
            h.input([
              h.Id("amount"),
              h.InputMode("numeric"),
              h.Attribute("value", String(initialModel.amount)),
              h.OnInput(readAmount),
            ]),
          ]),
          button("Add amount", amount === null ? null : Message.ClickedAdd({ n: amount })),
          button("Subtract amount", amount === null ? null : Message.ClickedSubtract({ n: amount })),
        ]),
        h.div([h.Class("actions")], [
          button("Reset", Message.ClickedReset()),
          button("Lock", Message.ClickedLock()),
          button("Unlock", Message.ClickedUnlock()),
        ]),
      ],
    ),
  };
};

const container = document.getElementById("root");
if (!container) throw new Error("verified-list-ui: missing element #root");

const app = Runtime.makeApplication({
  Model,
  Flags: Model,
  init,
  update,
  view,
  container,
  resources: BrowserKeyValueStore.layerLocalStorage,
});

// flags reads the saved fields from localStorage before the first render.
Runtime.run(app, { flags });
