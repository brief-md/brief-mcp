// src/context/index.ts — barrel export for context module

export type {
  GetConstraintsParams,
  GetConstraintsResult,
  GetContextParams,
  GetContextResult,
  GetDecisionsParams,
  GetDecisionsResult,
  GetQuestionsParams,
  GetQuestionsResult,
} from "./read.js";
export {
  getConstraints,
  getContext,
  getDecisions,
  getQuestions,
} from "./read.js";

export type {
  CaptureExternalSessionOptions,
  CaptureExternalSessionResult,
  ExternalDecision,
  UpdateSectionOptions,
  UpdateSectionResult,
} from "./write-sections.js";
export {
  _resetSectionStore,
  handleCaptureExternalSession,
  handleUpdateSection,
} from "./write-sections.js";
