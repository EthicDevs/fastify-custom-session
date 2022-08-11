import type { Session } from "../src/types";

declare module "fastify" {
  export interface FastifyRequest {
    session: Session;
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
export { PostgresSessionAdapter } from "./adapters/postgres";
export { PrismaSessionAdapter } from "./adapters/prisma";

export default makePlugin();
