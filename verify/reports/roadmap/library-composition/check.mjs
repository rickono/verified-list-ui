#!/usr/bin/env node
// Run through serial-verify.py. See README.md for scope and trust.
import { campaign } from "./campaign.mjs";
await campaign();
