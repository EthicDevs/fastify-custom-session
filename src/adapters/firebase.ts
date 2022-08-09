// 3rd-party
import type { App as FirebaseApp } from "firebase-admin/app";
import type { Firestore as FirebaseStore } from "firebase-admin/firestore";
import { getFirestore as getFirStore } from "firebase-admin/firestore";
// lib
import { CustomSession, ISessionStoreAdapter, Session } from "../types";
import { generateUniqSerial } from "../serial";

interface FirebaseSessionAdapterOptions {
  collectionName: string; // @default sessions
  firebaseApp: FirebaseApp;
}

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
    await this.firStore
      .collection(this.options.collectionName)
      .doc(sessionId)
      .create(safeSession);

    return session;
  }

  async readSessionById(sessionId: string): Promise<Session | null> {
    try {
      const sessDoc = await this.firStore
        .collection(this.options.collectionName)
        .doc(sessionId)
        .get();

      if (sessDoc == null || sessDoc.exists === false) {
        return null;
      }

      return sessDoc.data() as Session;
    } catch (err) {
      console.error(
        "[FirebaseSessionAdapater] could not read session",
        sessionId,
        err,
      );
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
      return true;
    } catch (err) {
      console.error(
        "[FirebaseSessionAdapater] could not update session",
        sessionId,
        err,
      );
      return false;
    }
  }

  async deleteSessionById(sessionId: string): Promise<boolean> {
    try {
      await this.firStore
        .collection(this.options.collectionName)
        .doc(sessionId)
        .delete();
      return true;
    } catch (err) {
      console.error(
        "[FirebaseSessionAdapater] could not delete session",
        sessionId,
        err,
      );
      return false;
    }
  }
}
