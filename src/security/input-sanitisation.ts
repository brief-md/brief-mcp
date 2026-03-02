// src/security/input-sanitisation.ts — stub for TASK-05b
// Replace with real implementation during build loop.

import type { OntologyPackSchema, ParameterType } from "../types/security.js";

export function normalizeForMatching(_input: string): string {
  throw new Error("Not implemented: normalizeForMatching");
}

export function validateRequiredString(
  _value: unknown,
  _paramName: string,
): string {
  throw new Error("Not implemented: validateRequiredString");
}

export function validateParameterLimits(
  _value: string,
  _paramName: string,
  _type: ParameterType,
): void {
  throw new Error("Not implemented: validateParameterLimits");
}

export function validateMutualExclusion(
  _params: Record<string, unknown>,
  _pairs: Array<[string, string]>,
): void {
  throw new Error("Not implemented: validateMutualExclusion");
}

export function sanitizeObject<T extends Record<string, unknown>>(_obj: T): T {
  throw new Error("Not implemented: sanitizeObject");
}

export function stripBidiCharacters(_input: string): string {
  throw new Error("Not implemented: stripBidiCharacters");
}

export function validateEntryId(_id: string): void {
  throw new Error("Not implemented: validateEntryId");
}

export interface HomoglyphWarning {
  detected: boolean;
  warning?: string;
}

export function detectHomoglyphs(_name: string): HomoglyphWarning {
  throw new Error("Not implemented: detectHomoglyphs");
}

export function validateOntologyPackSchema(_data: unknown): OntologyPackSchema {
  throw new Error("Not implemented: validateOntologyPackSchema");
}
