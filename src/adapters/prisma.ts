// 3rd-party
import debug from "debug";
import nullfined from "nullfined";
// lib
import type { CustomSession, ISessionStoreAdapter, Session } from "../types";
import { generateUniqSerial } from "../serial";

interface ISession {
  id: string;
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  // unfortunately we cannot use JsonObject here bcz generated Prisma code is weird...
  data: any; // JsonObject
  detectedUserAgent: string;
  detectedIPAddress: string;
}

export interface IPrismaClientAdapter {
  [x: string]: any;
  session: {
    findUnique(args: {
      where: {
        id: string;
      };
    }): Promise<ISession | null>;
    create(args: { data: ISession }): Promise<ISession>;
    delete(args: {
      where: {
        id: string;
      };
    }): Promise<ISession>;
    upsert(args: {
      where: {
        id: string;
      };
      create: ISession;
      update: ISession;
    }): Promise<ISession>;
  };
}

const logTrace = debug("prismaSessionAdapter:trace");
const logError = debug("prismaSessionAdapter:error");

/*
model Session {
  id        String @id @default(cuid())
  sessionId String @unique

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  expiresAt DateTime?

  data Json?

  detectedUserAgent String @default("")
  detectedIPAddress String @default("")
}
*/

/**
 * A Prisma Session Adapter conforming to the `ISessionStoreAdapter` interface.
 */
export class PrismaSessionAdapter implements ISessionStoreAdapter {
  private prismaClient: IPrismaClientAdapter;
  private getUniqId: () => string = generateUniqSerial;

  constructor(prismaClient: IPrismaClientAdapter) {
    this.prismaClient = prismaClient;
  }

  setUniqIdGenerator(uniqIdGenerator: () => string) {
    this.getUniqId = uniqIdGenerator;
  }

  async createSession(
    sessionData: CustomSession,
    metas: {
      detectedIPAddress?: string | undefined;
      detectedUserAgent: string;
    },
  ): Promise<Session> {
    const nowDate = new Date(Date.now());
    const sessionId = this.getUniqId();
    const session: Session = {
      id: sessionId,
      createdAtEpoch: nowDate.getTime(),
      updatedAtEpoch: nowDate.getTime(),
      expiresAtEpoch: null,
      data: sessionData || {},
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
      await this.prismaClient.session.create({
        data: {
          id: session.id,
          sessionId: session.id,
          createdAt: new Date(session.createdAtEpoch),
          updatedAt: new Date(session.updatedAtEpoch),
          expiresAt:
            session.expiresAtEpoch != null
              ? new Date(session.expiresAtEpoch)
              : undefined,
          data: session.data || {},
          detectedIPAddress: session.metas.detectedIPAddress || "",
          detectedUserAgent: session.metas.detectedUserAgent,
        } as ISession,
      });
      logTrace("Created session =>", sessionId, safeSession);
      return session;
    } catch (err) {
      logError("Could not create session =>", sessionId, safeSession, err);
      throw err;
    }
  }

  async readSessionById(sessionId: string): Promise<Session | null> {
    try {
      const session = await this.prismaClient.session.findUnique({
        where: {
          id: sessionId,
        },
      });

      if (session == null) {
        logError(
          "Cannot find session in prisma Session model table =>",
          sessionId,
          session,
        );
        return null;
      }

      logTrace("Read session =>", sessionId, session);
      return {
        id: session.id,
        createdAtEpoch: session.createdAt.getTime(),
        updatedAtEpoch: session.updatedAt.getTime(),
        expiresAtEpoch:
          session.expiresAt != null ? session.expiresAt.getTime() : null,
        data: session.data || {},
        metas: {
          detectedIPAddress: session.detectedIPAddress,
          detectedUserAgent: session.detectedUserAgent,
        },
        //
        destroy: () => Promise.resolve(false),
        reload: () => Promise.resolve(undefined),
        save: () => Promise.resolve(undefined),
      };
    } catch (err) {
      logError("Could not create session =>", sessionId, err);
      return null;
    }
  }

  async updateSessionById(
    sessionId: string,
    session: Session,
  ): Promise<boolean> {
    try {
      const sessionData: ISession = {
        id: session.id,
        sessionId: session.id,
        createdAt: new Date(session.createdAtEpoch),
        updatedAt: new Date(session.updatedAtEpoch),
        expiresAt:
          session.expiresAtEpoch != null
            ? new Date(session.expiresAtEpoch)
            : null,
        // recursive null -> undefined
        data: session.data == null ? {} : nullfined(session.data),
        detectedIPAddress: session.metas.detectedIPAddress || "",
        detectedUserAgent: session.metas.detectedUserAgent,
      };

      await this.prismaClient.session.upsert({
        where: {
          id: sessionId,
        },
        create: {
          ...sessionData,
          expiresAt:
            sessionData.expiresAt == null ? null : sessionData.expiresAt,
        },
        update: {
          ...sessionData,
          expiresAt:
            sessionData.expiresAt == null ? null : sessionData.expiresAt,
        },
      });

      logTrace("Read session =>", sessionId, session);
      return true;
    } catch (err) {
      logError("Could not create session =>", sessionId, err);
      return false;
    }
  }

  async deleteSessionById(sessionId: string): Promise<boolean> {
    try {
      await this.prismaClient.session.delete({
        where: {
          id: sessionId,
        },
      });
      return true;
    } catch (err) {
      logError("Could not delete session =>", sessionId, err);
      return false;
    }
  }
}
