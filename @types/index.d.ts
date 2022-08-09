import type { Session } from "../src/types";

declare module "fastify" {
  export interface FastifyRequest {
    session: null | Session;
  }
}
