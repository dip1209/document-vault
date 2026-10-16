import mongoose, { type Model, type Schema } from "mongoose";

type MongooseCache = {
  uri?: string;
  promise?: Promise<typeof mongoose>;
};

/**
 * Holds the connection across module reloads. Next.js dev re-evaluates modules on
 * every edit; without this, each reload opens a new pool and MongoDB eventually
 * refuses connections.
 */
const globalForMongoose = globalThis as unknown as {
  __documentVaultMongoose?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose.__documentVaultMongoose ??= {});

export async function connectToDatabase(uri: string): Promise<typeof mongoose> {
  if (cache.uri === uri && cache.promise) {
    return cache.promise;
  }

  if (cache.uri) {
    // A different URI was requested; drop the stale pool before reconnecting.
    cache.promise = undefined;
    cache.uri = undefined;
    await mongoose.disconnect();
  }

  cache.uri = uri;

  const promise = mongoose.connect(uri, {
    bufferCommands: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });

  cache.promise = promise;

  try {
    return await promise;
  } catch (error) {
    cache.promise = undefined;
    cache.uri = undefined;
    throw error;
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  cache.promise = undefined;
  cache.uri = undefined;
  await mongoose.disconnect();
}

export function connectionState(): mongoose.ConnectionStates {
  return mongoose.connection.readyState;
}

/**
 * Builds a model bound to a connection. Returns the already-registered model when
 * one exists so repeated calls (e.g. hot reload) reuse a single compiled schema.
 */
export function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  return existing ?? mongoose.model<T>(name, schema);
}