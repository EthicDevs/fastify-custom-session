// 3rd-party
import type { App as FirebaseApp } from "firebase-admin/app";
import type { Firestore as FirebaseStore } from "firebase-admin/firestore";
import { getFirestore as getFirStore } from "firebase-admin/firestore";
// lib
import { CustomSession, ISessionStoreAdapter, Session } from "../types";

interface FirebaseSessionAdapterOptions {
  collectionName: string; // @default sessions
  firebaseApp: FirebaseApp;
}

function generateUniqSerial(): string {
  return "xxxx-xxxx-xxx-xxxx".replace(/[x]/g, (_) => {
    const r = Math.floor(Math.random() * 16);
    return r.toString(16);
  });
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
        detectedIPAddress: metas.detectedIPAddress,
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

    await this.firStore
      .collection(this.options.collectionName)
      .doc(sessionId)
      .create(session);

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
    } catch (_) {
      return null;
    }
  }

  async updateSessionById(
    sessionId: string,
    session: Session,
  ): Promise<boolean> {
    try {
      await this.firStore
        .collection(this.options.collectionName)
        .doc(sessionId)
        .set(session);
      return true;
    } catch (_) {
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
    } catch (_) {
      return false;
    }
  }
}
