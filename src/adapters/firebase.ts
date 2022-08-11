// 3rd-party
import type { App as FirebaseApp } from "firebase-admin/app";
import type { Firestore as FirebaseStore } from "firebase-admin/firestore";
import { getFirestore as getFirStore } from "firebase-admin/firestore";
import debug from "debug";
// lib
import { CustomSession, ISessionStoreAdapter, Session } from "../types";
import { generateUniqSerial } from "../serial";

interface FirebaseSessionAdapterOptions {
  collectionName: string; // @default sessions
  firebaseApp: FirebaseApp;
  /**
   * Whether to skip nested properties that are set to `undefined` during object serialization. If set to `true`, these properties are skipped and not written to Firestore. If set `false` or omitted, the SDK throws an exception when it encounters properties of type `undefined`.
   */
  ignoreUndefinedProperties?: boolean; // @default true
}

const logTrace = debug("firebaseSessionAdapter:trace");
const logError = debug("firebaseSessionAdapter:error");

/**
 * A Firebase Session Adapter conforming to the `ISessionStoreAdapter` interface.
 * Fully working.
 */
export class FirebaseSessionAdapter implements ISessionStoreAdapter {
  private firApp: FirebaseApp;
  private firStore: FirebaseStore;
  private options: FirebaseSessionAdapterOptions;
  // private sessionOptions: SessionPluginOptions;

  constructor(
    options: FirebaseSessionAdapterOptions,
    // sessionOptions: SessionPluginOptions,
  ) {
    this.options = options;
    // this.sessionOptions = sessionOptions;
    this.firApp = options.firebaseApp;
    this.firStore = getFirStore(this.firApp);
    this.firStore.settings({
      ignoreUndefinedProperties: options?.ignoreUndefinedProperties || true,
    });
    return this;
  }

  async createSession(
    sessionData: CustomSession,
    metas: {
      detectedIPAddress?: string | undefined;
      detectedUserAgent: string;
    },
  ): Promise<Session> {
    const nowDate = new Date(Date.now());
    const sessionId = generateUniqSerial();
    const session: Session = {
      id: sessionId,
      createdAtEpoch: nowDate.getTime(),
      updatedAtEpoch: nowDate.getTime(),
      expiresAtEpoch: null,
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
      await this.firStore
        .collection(this.options.collectionName)
        .doc(sessionId)
        .create(safeSession);
      logTrace("Created session =>", sessionId, safeSession);
      return session;
    } catch (err) {
      logError("Could not create session =>", sessionId, safeSession, err);
      throw err;
    }
  }

  async readSessionById(sessionId: string): Promise<Session | null> {
    try {
      const sessDoc = await this.firStore
        .collection(this.options.collectionName)
        .doc(sessionId)
        .get();
      if (sessDoc == null || sessDoc.exists === false) {
        logTrace("Could not read session =>", sessionId);
        return null;
      }
      logTrace("Read session =>", sessionId, sessDoc);
      return sessDoc.data() as Session;
    } catch (err) {
      logError("Could not read session =>", sessionId, err);
      return null;
    }
  }

  async updateSessionById(
    sessionId: string,
    session: Session,
  ): Promise<boolean> {
    try {
      const { reload, save, destroy, ...safeSession } = session;
      await this.firStore
        .collection(this.options.collectionName)
        .doc(sessionId)
        .set(safeSession);
      logTrace("Updated session =>", sessionId, safeSession);
      return true;
    } catch (err) {
      logError("Could not update session =>", sessionId, err);
      return false;
    }
  }

  async deleteSessionById(sessionId: string): Promise<boolean> {
    try {
      await this.firStore
        .collection(this.options.collectionName)
        .doc(sessionId)
        .delete();
      logTrace("Deleted session =>", sessionId);
      return true;
    } catch (err) {
      logError("Could not delete session =>", sessionId, err);
      return false;
    }
  }
}
