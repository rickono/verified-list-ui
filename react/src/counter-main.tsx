import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../browser/styles.css";
import "./counter.css";
import { Counter } from "./Counter";

const root = document.getElementById("root");
if (!root) throw new Error("verified-list-ui: missing element #root");
createRoot(root).render(
  <StrictMode>
    <Counter />
  </StrictMode>,
);
