// 3rd-party
import debug from "debug";
// lib
import { CustomSession, ISessionStoreAdapter, Session } from "../types";
import { generateUniqSerial } from "../helpers";

interface MockSessionAdapterOptions {}

const logTrace = debug("mockSessionAdapter:trace");
const logError = debug("mockSessionAdapter:error");

/**
 * A Mock Session Adapter conforming to the `ISessionStoreAdapter` interface.
 * Fully working. Useful to write tests.
 *
 * Notice also how this adapter is fully synchronous even if it is being called
 * as if it was async by the customSession plugin, and that it does not break
 * the `ISessionStoreAdapter` interface.
 */
export class MockSessionAdapter implements ISessionStoreAdapter {
  private mockSessionStore: {
    [sessionId: string]: Omit<Session, "destroy" | "reload" | "save">;
  };
  private options: MockSessionAdapterOptions;
  private getUniqId: () => string = generateUniqSerial;

  constructor(options: MockSessionAdapterOptions) {
    this.mockSessionStore = {};
    this.options = options;
    this.options; // so typescript does not complain its unused.
    return this;
  }

  setUniqIdGenerator(uniqIdGenerator: () => string) {
    this.getUniqId = uniqIdGenerator;
  }

  createSession(
    sessionData: CustomSession,
    expiresAt: Date | null,
    metas: {
      detectedIPAddress?: string | undefined;
      detectedUserAgent: string;
    },
  ): Session {
    const nowDate = new Date(Date.now());
    const sessionId = this.getUniqId();
    const session: Session = {
      id: sessionId,
      createdAtEpoch: nowDate.getTime(),
      updatedAtEpoch: nowDate.getTime(),
      expiresAtEpoch: expiresAt != null ? expiresAt.getTime() : null,
      data: sessionData,
      metas: {
        detectedIPAddress: metas.detectedIPAddress || "",
        detectedUserAgent: metas.detectedUserAgent,
      },
      async destroy() {
        return false;
      },
      async reload() {
        return undefined;
      },
      async save() {
        return undefined;
      },
    };
    const { reload, save, destroy, ...safeSession } = session;
    try {
      this.mockSessionStore[sessionId] = safeSession;
      logTrace("Created session =>", sessionId, safeSession);
      return session;
    } catch (err) {
      logError("Could not create session =>", sessionId, safeSession, err);
      throw err;
    }
  }

  readSessionById(sessionId: string): Session | null {
    try {
      const session = this.mockSessionStore[sessionId];
      if (session == null) {
        logTrace("Could not read session =>", sessionId);
        return null;
      }
      logTrace("Read session =>", sessionId, session);
      return {
        ...session,
        async destroy() {
          return false;
        },
        async reload() {
          return undefined;
        },
        async save() {
          return undefined;
        },
      };
    } catch (err) {
      logError("Could not read session =>", sessionId, err);
      return null;
    }
  }

  updateSessionById(sessionId: string, session: Session): boolean {
    try {
      const { reload, save, destroy, ...safeSession } = session;
      this.mockSessionStore[sessionId] = safeSession;
      logTrace("Updated session =>", sessionId, safeSession);
      return true;
    } catch (err) {
      logError("Could not update session =>", sessionId, err);
      return false;
    }
  }

  deleteSessionById(sessionId: string): boolean {
    try {
      delete this.mockSessionStore[sessionId];
      logTrace("Deleted session =>", sessionId);
      return true;
    } catch (err) {
      logError("Could not delete session =>", sessionId, err);
      return false;
    }
  }

  /**
   * Utilities functions to make testing easier.
   * ! Not part of the `ISessionStoreAdapter` interface !
   */

  /**
   * Empty the sessions store. This remove all the sessions.
   */
  clear() {
    this.mockSessionStore = {};
  }
}
