export type JobStatus =
  | 'uploading'
  | 'transcribing'
  | 'detecting'
  | 'extracting'
  | 'rendering'
  | 'storing'
  | 'complete'
  | 'failed';

export type StageStatus = 'pending' | 'running' | 'complete' | 'failed';
export type SegmentStatus = 'pending' | 'approved' | 'rejected';
export type HookStrength = 'Weak' | 'Moderate' | 'Strong';

export interface PipelineStep {
  id: string;
  jobId: string;
  stage: 'upload' | 'transcribe' | 'detect' | 'extract' | 'render' | 'store';
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
}
