export type JobStatus =
  | 'uploading'
  | 'uploaded'
  | 'transcribing'
  | 'detecting'
  | 'extracting'
  | 'rendering'
  | 'storing'
  | 'complete'
  | 'failed';

export type StageStatus = 'pending' | 'running' | 'complete' | 'failed';
export type SegmentStatus = 'pending' | 'approved' | 'rejected';
export type SiaUploadStatus = 'pending' | 'queued' | 'uploading' | 'pinning' | 'ready' | 'failed';
export type HookStrength = 'Weak' | 'Moderate' | 'Strong';

export interface PipelineStep {
  id: string;
  jobId: string;
  stage: 'sia_upload' | 'transcribe' | 'detect' | 'extract' | 'render' | 'sia_store';
  status: StageStatus;
  progressPct: number;
  message: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Segment {
  id: string;
  jobId: string;
  startSeconds: number;
  endSeconds: number;
  hookStrength: HookStrength;
  viralityScore: number;
  emotionalSignal: string;
  transcriptExcerpt: string;
  status: SegmentStatus;
  clipPath: string | null;
  siaObjectId: string | null;
  createdAt: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  sourceFilename: string;
  sourceUrl?: string;
  sourceSiaObjectId: string | null;
  durationSeconds: number | null;
  siaHash: string | null;
  indexdKey: string | null;
  siaStatus: SiaUploadStatus;
  createdAt: string;
  updatedAt: string;
  pipelineSteps?: PipelineStep[];
  segments?: Segment[];
  _count?: { segments: number };
}

export interface SiaStatus {
  connected: boolean;
  demoMode: boolean;
  indexerUrl: string | null;
  reason: string | null;
}

export interface SiaLog {
  id: string;
  jobId: string;
  step: string;
  passed: boolean | null;
  message: string;
  ts: string;
}

export interface AppSettings {
  id: string;
  setupComplete: boolean;
  siaConnected: boolean;
  siaIndexerUrl: string | null;
  siaAppId: string | null;
  siaAppName: string | null;
  siaAppDescription: string | null;
  openrouterKey: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  githubClientId: string | null;
  githubClientSecret: string | null;
  webauthnRpId: string | null;
  webauthnOrigin: string | null;
  difficultyMaxRetries: number;
}

export interface SetupStatus {
  setupComplete: boolean;
  siaConnected: boolean;
  siaIndexerUrl: string | null;
  siaAppId: string | null;
  siaAppName: string | null;
  siaAppDescription: string | null;
  hasOpenrouterKey: boolean;
  hasGoogle: boolean;
  hasGitHub: boolean;
  hasWebauthn: boolean;
}

export interface SiaRegistrationResponse {
  ok: boolean;
  approval_url?: string;
  error?: string;
  already_connected?: boolean;
}

export interface SiaCheckResponse {
  ok: boolean;
  status?: 'approved' | 'pending';
  error?: string;
}