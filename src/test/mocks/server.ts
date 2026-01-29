import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Create MSW server instance for Node.js (vitest)
export const server = setupServer(...handlers);
