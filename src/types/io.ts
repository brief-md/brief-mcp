// src/types/io.ts

export interface AtomicWriteOptions {
  readonly preservePermissions?: boolean;
  readonly force?: boolean;
  readonly expectedMtime?: number;
}

export interface MtimeCheckResult {
  readonly changed: boolean;
  readonly currentMtime?: number;
  readonly expectedMtime?: number;
  readonly warning?: string;
}

export interface LockHandle {
  readonly release: () => void;
  readonly filePath: string;
}

export interface OrphanedTempFile {
  readonly path: string;
  readonly ageSecs: number;
  readonly isOld: boolean;
}

export interface WriteResult {
  readonly filePath: string;
  readonly success: boolean;
  readonly bytesWritten: number;
}
