import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  onJobCreated,
  onJobUploaded,
  onJobTranscribed,
  onJobDetected,
  onJobExtracted,
} from '@/lib/inngest/pipeline';

/**
 * Inngest serve route.
 *
 * This exposes the Inngest functions so the Inngest dev server
 * can discover and invoke them. The functions call the Python
 * FastAPI backend for each pipeline stage.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    onJobCreated,
    onJobUploaded,
    onJobTranscribed,
    onJobDetected,
    onJobExtracted,
  ],
});