import type { Session } from "../src/types";

declare module "fastify" {
  export interface FastifyRequest {
    session: null | Session;
  }
}

import { makePlugin } from "./pluginFactory";

export type {
  Session,
  CustomSession,
  ISessionStoreAdapter,
  ISessionStoreAdapterConstructable,
} from "../src/types";

export { FirebaseSessionAdapter } from "./adapters/firebase";
// export { PostgresSessionAdapter } from "./adapters/postgres";

export default makePlugin();
