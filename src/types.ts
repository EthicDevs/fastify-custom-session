// 3rd-party
import { CookieSerializeOptions } from "@fastify/cookie";

// app
export declare type passwordsMap = {
  [id: string]: string;
};

export declare type password = string | passwordsMap;

/**
 * From https://github.com/sindresorhus/type-fest/
 * Matches a JSON object.
 * This type can be useful to enforce some input to be JSON-compatible or as a super-type to be extended from.
 */
export type JsonObject = { [Key in string]?: JsonValue };

/**
 * From https://github.com/sindresorhus/type-fest/
 * Matches a JSON array.
 */
export interface JsonArray extends Array<JsonValue> {}

/**
 * From https://github.com/sindresorhus/type-fest/
 * Matches any valid JSON value.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | JsonObject
  | JsonArray
  | null;

// So it's possible to override this through declaration merging
export declare interface CustomSession extends JsonObject {}

export declare interface Session {
  id: string;
  createdAtEpoch: number;
  updatedAtEpoch: number;
  expiresAtEpoch: null | number;
  data: CustomSession;
  metas: {
    detectedUserAgent: string;
    detectedIPAddress?: string;
  };
  // public api
  destroy(): Promise<boolean>;
  // compat-layer
  reload(): Promise<void>;
  save(): Promise<void>;
}

export interface ISessionStoreAdapter {
  /**
   * A function that will be called once the `fastifyCustomSession` plugin is
   * registered into the server so that the session adapter passed as options
   * can make use of it to generate session id's or other unique ids.
   */
  setUniqIdGenerator(uniqIdGenerator: () => string): void;
  /**
   * A function whose implementation will create/store the session and return
   * a new Session object. Also it gets passed some meta data so it's possible to
   * diff/merge the sessions with more confidence in case that's something you need.
   *
   * @example implementation:
   *   const nowDate = new Date(Date.now());
   *   const sessionId = uuid();
   *   const session: Session = await db.table('sessions').create({
   *     id: sessionId,
   *     createdAtEpoch: nowDate.getTime(),
   *     updatedAtEpoch: nowDate.getTime(),
   *     expiresAtEpoch: null,
   *     data: sessionData,
   *     metas: metas,
   *   });
   *   return session;
   *
   * @returns Promise<Session>
   */
  createSession(
    sessionData: CustomSession,
    expiresAt: Date | null,
    metas: {
      detectedIPAddress?: string;
      detectedUserAgent: string;
    },
  ): Promise<Session>;
  /**
   * A function whose implementation will retrieve a session given its id and
   * return it, or null if it couldn't be created.
   */
  readSessionById(sessionId: string): Promise<Session | null>;
  /**
   * A function whose implementation will update a session given its id and the
   * new session state. It will returns with a boolean indicating if the update
   *  was successful or not in the system where the session is saved.
   */
  updateSessionById(sessionId: string, session: Session): Promise<boolean>;
  /**
   * A function whose implementation will delete a session given its id. It will
   * returns with a boolean indicating if the deletion was successful or not in
   * the system where the session is saved.
   */
  deleteSessionById(sessionId: string): Promise<boolean>;
}

export interface ISessionStoreAdapterConstructable<T> {
  new (options: T, sessionOptions: SessionPluginOptions): ISessionStoreAdapter;
}

export interface SessionPluginOptions {
  /**
   * This is the cookie name that will be used inside the browser. You should make sure it's unique given
   * your application. Example: vercel-session
   */
  cookieName: string;
  /**
   * This is the password(s) that will be used to encrypt the cookie. It can be either a string or an object
   * like {1: "password", 2: password}.
   *
   * When you provide multiple passwords then all of them will be used to decrypt the cookie and only the most
   * recent (= highest key, 2 in this example) password will be used to encrypt the cookie. This allow you
   * to use password rotation (security)
   */
  password: password;
  /**
   * This is the time in seconds that the session will be valid for. This also set the max-age attribute of
   * the cookie automatically (minus 60 seconds so that the cookie always expire before the session).
   * if set will take precedence over cookiesOptions.maxAge
   */
  ttl?: number;
  /**
   * This is the options that will be passed to the cookie library.
   * You can see all of them here: https://github.com/jshttp/cookie#options-1.
   *
   * If you want to use "session cookies" (cookies that are deleted when the browser is closed) then you need
   * to pass cookieOptions: { maxAge: undefined }.
   */
  cookieOptions?: CookieSerializeOptions;
  /**
   * The initial shape of the Session data, used to provide typings to TypeScript users.
   */
  initialSession: CustomSession;
  /**
   * A class/object that implements/conforms to the ISessionStoreAdapter interface.
   * This is where you implement the getters/setters so that data can flow into
   * the desired place to fit your requirements/needs.
   */
  storeAdapter: ISessionStoreAdapter;
  /**
   * A function that return a unique ID to be used in sessionId generation.
   * If not provided it will default to xxxx-xxxx-xxxx-xxxx (short uuid).
   */
  getUniqId?: () => string;
}
