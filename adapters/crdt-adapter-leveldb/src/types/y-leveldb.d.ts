/// <reference types="node" />
export const PREFERRED_TRIM_SIZE: 500;
export function writeUint32BigEndian(encoder: encoding.Encoder, num: number): void;
export function readUint32BigEndian(decoder: decoding.Decoder): number;
export const keyEncoding: {
    buffer: boolean;
    type: string;
    encode: (arr: Array<string | number>) => Buffer;
    decode: (buf: Uint8Array) => (string | number)[];
};
export function getLevelBulkData(db: any, opts: object): Promise<Array<any>>;
export function getLevelUpdates(db: any, docName: string, opts?: any): Promise<Array<Buffer>>;
export function getAllDocs(db: any, values: boolean, keys: boolean): Promise<Array<any>>;
export function getCurrentUpdateClock(db: any, docName: string): Promise<number>;
export class LeveldbPersistence {
    /**
     * @param {string} location
     * @param {object} [opts]
     * @param {any} [opts.level] Level-compatible adapter. E.g. leveldown, level-rem, level-indexeddb. Defaults to `level`
     * @param {object} [opts.levelOptions] Options that are passed down to the level instance
     */
    constructor(location: string, { level, levelOptions }?: {
        level?: any;
        levelOptions?: object;
    } | undefined);
    tr: Promise<any>;
    /**
     * Execute an transaction on a database. This will ensure that other processes are currently not writing.
     *
     * This is a private method and might change in the future.
     *
     * @todo only transact on the same room-name. Allow for concurrency of different rooms.
     *
     * @template T
     *
     * @param {function(any):Promise<T>} f A transaction that receives the db object
     * @return {Promise<T>}
     */
    _transact: <T>(f: (arg0: any) => Promise<T>) => Promise<T>;
    /**
     * @param {string} docName
     */
    flushDocument(docName: string): Promise<void>;
    /**
     * @param {string} docName
     * @return {Promise<Y.Doc>}
     */
    getYDoc(docName: string): Promise<Y.Doc>;
    /**
     * @param {string} docName
     * @return {Promise<Uint8Array>}
     */
    getStateVector(docName: string): Promise<Uint8Array>;
    /**
     * @param {string} docName
     * @param {Uint8Array} update
     * @return {Promise<number>} Returns the clock of the stored update
     */
    storeUpdate(docName: string, update: Uint8Array): Promise<number>;
    /**
     * @param {string} docName
     * @param {Uint8Array} stateVector
     */
    getDiff(docName: string, stateVector: Uint8Array): Promise<Uint8Array>;
    /**
     * @param {string} docName
     * @return {Promise<void>}
     */
    clearDocument(docName: string): Promise<void>;
    /**
     * @param {string} docName
     * @param {string} metaKey
     * @param {any} value
     * @return {Promise<void>}
     */
    setMeta(docName: string, metaKey: string, value: any): Promise<void>;
    /**
     * @param {string} docName
     * @param {string} metaKey
     * @return {Promise<any>}
     */
    delMeta(docName: string, metaKey: string): Promise<any>;
    /**
     * @param {string} docName
     * @param {string} metaKey
     * @return {Promise<any>}
     */
    getMeta(docName: string, metaKey: string): Promise<any>;
    /**
     * @return {Promise<Array<string>>}
     */
    getAllDocNames(): Promise<Array<string>>;
    /**
     * @return {Promise<Array<{ name: string, sv: Uint8Array, clock: number }>>}
     */
    getAllDocStateVectors(): Promise<Array<{
        name: string;
        sv: Uint8Array;
        clock: number;
    }>>;
    /**
     * @param {string} docName
     * @return {Promise<Map<string, any>>}
     */
    getMetas(docName: string): Promise<Map<string, any>>;
    /**
     * Close connection to a leveldb database and discard all state and bindings
     *
     * @return {Promise<void>}
     */
    destroy(): Promise<void>;
    /**
     * Delete all data in database.
     */
    clearAll(): Promise<any>;
}
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { Buffer } from "buffer";
import * as Y from "yjs";
//# sourceMappingURL=y-leveldb.d.ts.map