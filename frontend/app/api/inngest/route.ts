import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  onJobCreated,
  onJobUploaded,
  onJobTranscribed,
  onJobDetected,
  onJobExtracted,
} from '@/lib/inngest/pipeline';

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
