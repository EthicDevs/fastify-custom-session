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
import {
  generateUniqSerial,
  parseSessionIdFromCookieData,
  parseSessionMetasFromRequest,
} from "./helpers";

const logTrace = debug("customSession:trace");
const logError = debug("customSession:error");

const compatNoopFunctions = {
  async reload() {
    return undefined;
  },
  async save() {
    return undefined;
  },
};

const customSessionPluginAsync: FastifyPluginAsync<SessionPluginOptions> =
  async (server, options) => {
    logTrace("custom session plugin made!");

    const { initialSession, storeAdapter, ttl } = options;
    const getUniqId = options?.getUniqId || generateUniqSerial;
    // session ttl minus 60 seconds so cookie expires before the session
    const cookieTTLOverride: number | undefined =
      ttl != null ? Math.max(0, ttl, ttl - 60) : undefined;

    if (cookieTTLOverride != null) {
      logTrace(`session time to live set to: ${cookieTTLOverride}`);
    }

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
        const session = request.session;
        try {
          const sessId = session.id;
          const nowDate = new Date(Date.now());
          request.session = {
            id: getUniqId(),
            createdAtEpoch: nowDate.getTime(),
            updatedAtEpoch: nowDate.getTime(),
            expiresAtEpoch: -1, // make sure it expires right now.
            data: {},
            metas: {
              detectedUserAgent: "<not-set>",
              detectedIPAddress: "<not-set>",
            },
            destroy: getDestroySession(request, reply), // will be overidden by next onRequest
            // no-op for compatibility
            ...compatNoopFunctions,
          };
          if (reply.sent === false) {
            reply.clearCookie(options.cookieName, options.cookieOptions);
          }
          await storeAdapter.deleteSessionById(sessId);
          return true;
        } catch (err) {
          logError("cannot destroy session.", session.id, err);
          request.session = session;
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
      const now = Date.now();

      let session: null | Session = null;
      let sessionId: null | string = null;

      const expiresInSeconds: number | undefined =
        cookieTTLOverride || options.cookieOptions?.maxAge;
      const expiresAt: Date | null =
        expiresInSeconds != null
          ? new Date(now + (expiresInSeconds || 0) * 1000)
          : null;

      const cookieData = request.cookies[options.cookieName];
      if (cookieData == null) {
        try {
          const sessionMetas = parseSessionMetasFromRequest(request);
          session = await storeAdapter.createSession(
            initialSession,
            expiresAt,
            {
              ...sessionMetas,
              detectedUserAgent: sessionMetas.detectedUserAgent || "<not-set>",
            },
          );
          sessionId = session.id;
          reply.cookie(options.cookieName, sessionId, {
            ...options.cookieOptions,
            maxAge: expiresInSeconds,
          });
          logTrace("new cookie session made =>", options.cookieName, sessionId);
        } catch (err) {
          logError("could not create session =>", sessionId, err);
        }
      } else {
        sessionId = parseSessionIdFromCookieData(cookieData);
      }

      if (
        sessionId != null &&
        sessionId.trim() !== "" &&
        sessionId.trim() !== "undefined" &&
        sessionId.trim() !== "null" &&
        sessionId.trim() !== "__proto__"
      ) {
        // TODO(refactor): #->ensureCookieValue
        sessionId = sessionId.split(".")[0];
        try {
          session = await storeAdapter.readSessionById(sessionId);
          logTrace("read session success =>", sessionId, session);
          if (session != null && session.expiresAtEpoch != null) {
            const sessionHasExpired = now >= session.expiresAtEpoch;
            logTrace(
              `now: ${now} >= session.expiresAtEpoch: ${session.expiresAtEpoch} = ${sessionHasExpired}`,
            );
            if (sessionHasExpired) {
              logTrace("session expired, removing it =>", sessionId, session);
              await storeAdapter.deleteSessionById(sessionId);
              reply.clearCookie(options.cookieName, options.cookieOptions);
              request.session.expiresAtEpoch = -1; // avoid resaving it
              session = null;
              sessionId = getUniqId();
              logTrace("expired session deleted");
            }
          }
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
          data: {
            ...options.initialSession, // so undefined gets back as null
            ...session.data,
          },
          destroy: getDestroySession(request, reply),
          // no-op for compatibility
          ...compatNoopFunctions,
        };
        logTrace("restored session =>", sessionId, request.session);
      } else {
        const sessionMetas = parseSessionMetasFromRequest(request);
        request.session = {
          id: sessionId,
          createdAtEpoch: now,
          updatedAtEpoch: now,
          expiresAtEpoch: expiresAt != null ? expiresAt.getTime() : null,
          data: {},
          metas: {
            ...sessionMetas,
            detectedUserAgent: sessionMetas.detectedUserAgent || "<not-set>",
          },
          destroy: getDestroySession(request, reply),
          // no-op for compatibility
          ...compatNoopFunctions,
        };
        logTrace("made new session =>", sessionId, request.session);
      }
    });

    server.addHook("onSend", async (request) => {
      if (request.session == null || request.session?.expiresAtEpoch === -1) {
        return undefined;
      }

      const sessionData: Session = request.session;
      const cookieData = request.cookies[options.cookieName];

      let sessionId = parseSessionIdFromCookieData(cookieData);

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
          data: {
            ...options.initialSession, // so undefined gets back as null
            ...sessionData.data,
          },
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
