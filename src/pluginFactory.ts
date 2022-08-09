// std
import { IncomingMessage, Server, ServerResponse } from "http";
// 3rd-party - fastify std
import type { RouteGenericInterface } from "fastify/types/route";
import type {
  FastifyLoggerInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import makeFastifyPlugin from "fastify-plugin";
// app
import type { Session, SessionPluginOptions } from "./types";
import { FASTIFY_VERSION_TARGET } from "./constants";
import { generateUniqSerial } from "./serial";

const UNSIGNED_COOKIE_REGEXP = /^(.*)$/i;
const SIGNED_COOKIE_REGEXP = /^([^.].*)\.(.*)$/i;

const customSessionPluginAsync: FastifyPluginAsync<SessionPluginOptions> =
  async (server, options) => {
    const { initialSession, storeAdapter } = options;

    server.decorateRequest("session", null);

    function getDestroySession(
      request: FastifyRequest<
        RouteGenericInterface,
        Server,
        IncomingMessage,
        unknown,
        FastifyLoggerInstance
      >,
      reply: FastifyReply<
        Server,
        IncomingMessage,
        ServerResponse,
        RouteGenericInterface,
        unknown
      >,
    ) {
      return async (): Promise<boolean> => {
        if (request.session == null) {
          return false;
        }
        try {
          await storeAdapter.deleteSessionById(request.session.id);
          request.session.data = {};
          if (reply.sent === false) {
            reply.clearCookie(options.cookieName, options.cookieOptions);
          }
          return true;
        } catch (err) {
          console.error("cannot destroy session.", request.session?.id, err);
          return false;
        }
      };
    }

    server.addHook("preHandler", async (request, reply) => {
      let session: null | Session = null;
      let sessionId: null | string = null;

      const cookieData = request.cookies[options.cookieName];
      const ipAddresses = (request?.ips || [request.ip]).filter(
        (ip) => ip !== "127.0.0.1",
      );
      const detectedIPAddress =
        ipAddresses.length >= 1 ? ipAddresses[0] : undefined;
      const detectedUserAgent = request.headers["user-agent"] || "<not-set>";

      if (cookieData == null) {
        try {
          session = await storeAdapter.createSession(initialSession, {
            detectedIPAddress,
            detectedUserAgent,
          });
          sessionId = session.id;
          reply.cookie(options.cookieName, sessionId, options.cookieOptions);
          console.log(
            "new cookie session made =>",
            options.cookieName,
            sessionId,
          );
        } catch (err) {
          console.error("could not create session.", err);
        }
      } else {
        const cookieMatchesUnsigned = UNSIGNED_COOKIE_REGEXP.exec(cookieData);
        const cookieMatchesSigned = SIGNED_COOKIE_REGEXP.exec(cookieData);

        if (
          cookieMatchesUnsigned != null &&
          Array.isArray(cookieMatchesUnsigned)
        ) {
          const [_, sid] = cookieMatchesUnsigned;
          sessionId = sid;
        } else if (
          cookieMatchesSigned != null &&
          Array.isArray(cookieMatchesSigned)
        ) {
          // TODO: Check signature [2].
          const [_, sid] = cookieMatchesSigned;
          sessionId = sid.split(".")[0];
        } else {
          sessionId = cookieData;
        }
      }

      if (
        sessionId != null &&
        sessionId.trim() !== "" &&
        sessionId.trim() !== "undefined" &&
        sessionId.trim() !== "null" &&
        sessionId.trim() !== "__proto__"
      ) {
        try {
          session = await storeAdapter.readSessionById(sessionId);
          console.log("read session success =>", sessionId, session);
        } catch (err) {
          console.error("cannot restore session =>", sessionId, err);
          session = null;
        }
      } else {
        sessionId = generateUniqSerial();
      }

      if (session != null) {
        // set helper functions on the session object
        request.session = {
          ...session,
          destroy: getDestroySession(request, reply),
          // no-op for compatibility
          reload: async function reload(): Promise<void> {
            return undefined;
          },
          save: async function save(): Promise<void> {
            return undefined;
          },
        };
        console.log("restored session =>", sessionId, request.session);
      } else {
        const nowDate = new Date(Date.now());
        request.session = {
          id: sessionId,
          createdAtEpoch: nowDate.getTime(),
          updatedAtEpoch: nowDate.getTime(),
          expiresAtEpoch: null,
          data: {},
          metas: {
            detectedUserAgent: "<not-set>",
            detectedIPAddress: "<not-set>",
          },
          destroy: getDestroySession(request, reply),
          // no-op for compatibility
          reload: async function reload(): Promise<void> {
            return undefined;
          },
          save: async function save(): Promise<void> {
            return undefined;
          },
        };
        console.log("made new session", sessionId, request.session);
      }
    });

    server.addHook("onSend", async (request) => {
      if (request.session == null) {
        return undefined;
      }

      const sessionData: Session = request.session;
      const cookieData = request.cookies[options.cookieName];

      let sessionId: null | string = null;
      const cookieMatchesUnsigned = UNSIGNED_COOKIE_REGEXP.exec(cookieData);
      const cookieMatchesSigned = SIGNED_COOKIE_REGEXP.exec(cookieData);

      if (
        cookieMatchesUnsigned != null &&
        Array.isArray(cookieMatchesUnsigned)
      ) {
        const [_, sid] = cookieMatchesUnsigned;
        sessionId = sid;
      } else if (
        cookieMatchesSigned != null &&
        Array.isArray(cookieMatchesSigned)
      ) {
        // TODO: Check signature [2].
        const [_, sid] = cookieMatchesSigned;
        sessionId = sid.split(".")[0];
      } else {
        sessionId = null;
      }

      if (
        sessionId != null &&
        sessionId.trim() !== "" &&
        sessionId.trim() !== "undefined" &&
        sessionId.trim() !== "null" &&
        sessionId.trim() !== "__proto__"
      ) {
        let prevData: Session | null = null;
        try {
          prevData = await storeAdapter.readSessionById(sessionId);
          console.log("read session success =>", sessionId, prevData);
        } catch (err) {
          console.error("cannot find session to load.", err);
          prevData = null;
        }

        const nowDate = new Date(Date.now());
        const nextSession: Session = {
          ...sessionData,
          id: sessionId,
          updatedAtEpoch: nowDate.getTime(),
        };

        const {
          destroy: __,
          reload: ___,
          save: ____,
          updatedAt: _____,
          ...reqSession
        } = (prevData || {}) as any;

        const nextSessionStr = JSON.stringify(sessionData.data);
        const reqSessionStr = JSON.stringify(reqSession.data);

        if (nextSessionStr !== reqSessionStr) {
          try {
            await storeAdapter.updateSessionById(sessionId, nextSession);
            console.log("updated session =>", sessionId, nextSession);
          } catch (err) {
            console.error("could not save session data.", err);
          }
        } else {
          console.log("skipped useless write, session did not change");
        }
      }
      return undefined;
    });
  };

export function makePlugin() {
  return makeFastifyPlugin(customSessionPluginAsync, FASTIFY_VERSION_TARGET);
}
