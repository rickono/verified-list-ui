import { Message, cap, initialModel, update } from "./level.fold";

const raised = update(initialModel, Message.Raised({ n: 3 }));
export const level: number = raised.model.level;
export const atCap: boolean = level === cap;
