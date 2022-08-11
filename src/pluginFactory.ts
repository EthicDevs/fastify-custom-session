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
import debug from "debug";
// app
import type { Session, SessionPluginOptions } from "./types";
import { FASTIFY_VERSION_TARGET } from "./constants";
import { generateUniqSerial } from "./serial";

const UNSIGNED_COOKIE_REGEXP = /^(.*)$/i;
const SIGNED_COOKIE_REGEXP = /^([^.].*)\.(.*)$/i;

const logTrace = debug("customSession:trace");
const logError = debug("customSession:error");

const customSessionPluginAsync: FastifyPluginAsync<SessionPluginOptions> =
  async (server, options) => {
    const { initialSession, storeAdapter } = options;
    const getUniqId = options?.getUniqId || generateUniqSerial;

    storeAdapter.setUniqIdGenerator(getUniqId);
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
        const sessionBackup = request.session;
        try {
          const sessId = sessionBackup.id;
          const nowDate = new Date(Date.now());
          request.session = {
            id: getUniqId(),
            createdAtEpoch: nowDate.getTime(),
            updatedAtEpoch: nowDate.getTime(),
            expiresAtEpoch: null,
            data: {},
            metas: {
              detectedUserAgent: "<not-set>",
              detectedIPAddress: "<not-set>",
            },
            destroy: getDestroySession(request, reply), // will be overidden by next onRequest
            // no-op for compatibility
            reload: async function reload(): Promise<void> {
              return undefined;
            },
            save: async function save(): Promise<void> {
              return undefined;
            },
          };
          if (reply.sent === false) {
            reply.clearCookie(options.cookieName, options.cookieOptions);
          }
          await storeAdapter.deleteSessionById(sessId);
          return true;
        } catch (err) {
          logError("cannot destroy session.", sessionBackup.id, err);
          request.session = sessionBackup;
          reply.cookie(
            options.cookieName,
            request.session.id,
            options.cookieOptions,
          );
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
          logTrace("new cookie session made =>", options.cookieName, sessionId);
        } catch (err) {
          logError("could not create session =>", sessionId, err);
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
          sessionId = sid;
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
        sessionId = sessionId.split(".")[0];

        try {
          session = await storeAdapter.readSessionById(sessionId);
          logTrace("read session success =>", sessionId, session);
        } catch (err) {
          logError("cannot restore session =>", sessionId, err);
          session = null;
        }
      } else {
        sessionId = getUniqId();
        logTrace("Generated new sessionId =>", sessionId);
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
        logTrace("restored session =>", sessionId, request.session);
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
        logTrace("made new session =>", sessionId, request.session);
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
        sessionId = sid;
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
        sessionId = sessionId.split(".")[0];

        let prevData: Session | null = null;
        try {
          prevData = await storeAdapter.readSessionById(sessionId);
          logTrace("read session success =>", sessionId, prevData);
        } catch (err) {
          logError("cannot load session =>", sessionId, err);
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
            const success = await storeAdapter.updateSessionById(
              sessionId,
              nextSession,
            );
            if (success) {
              logTrace("updated session =>", sessionId, nextSession);
            } else {
              logTrace("could not update session data =>", sessionId);
            }
          } catch (err) {
            logError("could not save session data =>", sessionId, err);
          }
        } else {
          logTrace(
            "skipped useless write, session did not change =>",
            sessionId,
            "before:",
            reqSessionStr,
            "after:",
            nextSessionStr,
          );
        }
      }
      return undefined;
    });
  };

export function makePlugin() {
  return makeFastifyPlugin(customSessionPluginAsync, FASTIFY_VERSION_TARGET);
}
