// Renderer for the Foldkit list. The model, update, the save command, and
// restoring at start-up all come from the printed program
// (theories/ListFold.v through theories/FoldTs.v). The view copies the
// model into the same markup as the other list pages and sends
// ClickedItem({ n: id }) for a row, ClickedDelete, and ClickedReset.
//
// It decides two things itself, both read straight off the model: a row is
// selected when its id is model.selected (View.v's [is_selected]), and the
// empty message shows when there are no items ([show_empty_message]).
// Delete is enabled exactly when can(model, ClickedDelete()) holds, which
// ListFold.v proves is View.v's [delete_enabled] ([can_delete]).
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { Runtime } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { Message, Model, can, flags, init, update } from "./list.fold";
import "../../browser/styles.css";

const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const remove = Message.ClickedDelete();
  const reset = Message.ClickedReset();
  return {
    title: "Verified list (Foldkit)",
    body: h.main(
      [],
      [
        h.h1([], ["Verified list"]),
        h.p([h.Class("hint")], [
          "Select an item, then delete it. Reset restores the three starting items. The list is saved in this browser.",
        ]),
        h.ul(
          [h.Id("items"), h.AriaLabel("Items")],
          // Keyed by id, so a deleted row's element is removed, not reused.
          model.items.map((it) => {
            const selected = model.selected === it.id;
            return h.keyed("li")(it.id, [], [
              h.button(
                [
                  h.Type("button"),
                  h.Class(selected ? "row selected" : "row"),
                  h.AriaPressed(selected ? "true" : "false"),
                  h.DataAttribute("id", String(it.id)),
                  h.OnClick(Message.ClickedItem({ n: it.id })),
                ],
                [it.label],
              ),
            ]);
          }),
        ),
        h.p([h.Id("empty"), h.Hidden(model.items.length > 0)], ["No items left."]),
        h.div([h.Class("actions")], [
          h.button(
            [h.Type("button"), h.Id("delete"), h.Disabled(!can(model, remove)), h.OnClick(remove)],
            ["Delete selected"],
          ),
          h.button(
            [h.Type("button"), h.Id("reset"), h.Disabled(!can(model, reset)), h.OnClick(reset)],
            ["Reset"],
          ),
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

// flags reads the saved list from localStorage before the first render.
Runtime.run(app, { flags });
