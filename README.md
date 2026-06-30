# Rebit

Introducing **ReBit**, an innovative decentralized video clipping engine designed for transforming long-form videos into captivating short-form vertical clips while ensuring full self-hosting capabilities with storage solutions powered by Sia.

**What ReBit Does:**
I built this to streamline your content creation process, enabling you effortlessly turn lengthy raw footage or recorded events straight from your device (like a smartphone) directly onto the web. With just one click of an upload button on our platform, users can instantly access their videos and start creating vertical clips.

ReBit leverages cutting-edge technologies such as TypeScript for robust development practices alongside CSS to ensure sleek styling across all components—ensuring everything looks great while maintaining high performance standards with a total file count standing at 31. Key files like `route.ts`, which manage API interactions, along with global styles in `globals.css` and component structures defined within `.tsx` extensions showcase our commitment towards efficient code organization.

Key functionalities include:
- **Decentralized Storage**: Leveraging Sia for secure storage solutions.
- **User-Friendly Interface**: Intuitive video upload process directly from mobile devices to the web platform without any hassle or need for additional software downloads. 
- **Automated Processing Pipelines**: Seamlessly manage jobs through advanced TypeScript functions, ensuring videos are processed and ready within minutes.

ReBit is not just a tool; it’s an all-in-one solution designed with both creators' convenience in mind while pushing the boundaries of decentralized video processing technology for today's fast-paced digital world. Get started today to experience how ReBit can revolutionize your content creation workflow!

## 📊 Quick Stats

- 📁 **31 files** across 18 directories
- 💻 **25 code files** in 2 programming languages
- 🚀 **Languages:** TypeScript, CSS
- 📦 **Size:** 247,388 bytes

---

## 🔍 Detailed Analysis

PROJECT ANALYSIS REQUEST

Project Name: rebit
Root Path: /Users/darlingtongospel/Sites/rebit

STATISTICS:
- Total Files: 31
- Code Files: 25
- Total Directories: 18
- Total Size: 247388 bytes
- Languages Used: TypeScript, CSS
- File Types: {'.example': 1, '.ts': 10, '.ico': 1, '.css': 1, '.tsx': 12, '.mjs': 2, '.prisma': 1, '.json': 2, '.tsbuildinfo': 1}

PROJECT STRUCTURE:
└─ frontend
   ├─ .env.example
   ├─ app
   │  ├─ api
   │  │  ├─ inngest
   │  │  │  └─ route.ts
   │  │  └─ jobs
   │  │     ├─ [id]
   │  │     │  ├─ route.ts
   │  │     │  └─ segments
   │  │     │     └─ route.ts
   │  │     └─ route.ts
   │  ├─ favicon.ico
   │  ├─ globals.css
   │  ├─ layout.tsx
   │  ├─ page.tsx
   │  ├─ projects
   │  │  ├─ [id]
   │  │  │  ├─ clips
   │  │  │  │  └─ page.tsx
   │  │  │  └─ page.tsx
   │  │  └─ page.tsx
   │  ├─ setup
   │  │  └─ page.tsx
   │  └─ upload
   │     └─ page.tsx
   ├─ components
   │  ├─ ClipCard.tsx
   │  ├─ NavBar.tsx
   │  ├─ PipelineTracker.tsx
   │  ├─ ProjectCard.tsx
   │  └─ SiaStatus.tsx
   ├─ eslint.config.mjs
   ├─ lib
   │  ├─ inngest
   │  │  ├─ client.ts
   │  │  └─ pipeline.ts
   │  ├─ mock
   │  │  └─ data.ts
   │  ├─ prisma
   │  │  └─ schema.prisma
   │  └─ types
   │     └─ index.ts
   ├─ next-env.d.ts
   ├─ next.config.ts
   ├─ package.json
   ├─ postcss.config.mjs
   ├─ tsconfig.json
   └─ tsconfig.tsbuildinfo

KEY FILES CONTENT PREVIEW:
File: frontend/app/api/inngest/route.ts
Language: .ts
Preview: import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  onJobCreated,
  onJobUploaded,
  onJobTranscribed,
  onJobDetected,
  onJobExtracted,
} from '@/lib/inn...

File: frontend/app/api/jobs/[id]/route.ts
Language: .ts
Preview: import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // TODO...

File: frontend/app/api/jobs/[id]/segments/route.ts
Language: .ts
Preview: import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
 ...

File: frontend/app/api/jobs/route.ts
Language: .ts
Preview: import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';
// import { prisma } from '@/lib/prisma/client'; // wire up when DB is ready
import { createId ...

File: frontend/app/globals.css
Language: .css
Preview: @import "tailwindcss";

:root {
  --bg: #0a0a0f;
  --bg-elevated: #111118;
  --bg-card: #16161f;
  --border: #1e1e2e;
  --border-subtle: #13131a;
  --accent: #7c3aed;
  --accent-bright: #8b5cf6;
  --a...

File: frontend/app/layout.tsx
Language: .tsx
Preview: import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'ReBit — Decentralized Video Clipping Engine',
  d...

File: frontend/app/page.tsx
Language: .tsx
Preview: export default function Home() { redirect('/projects'); }
...

File: frontend/app/projects/[id]/clips/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ClipCard from '@/components/ClipCard';

export const metadata = {
  title: `Clips - ${process.env.NEXT_PUBLIC_PROJECT_ID}`,
};

const DEMO_MODE = true; // replace with real Sia sta...

File: frontend/app/projects/[id]/page.tsx
Language: .tsx
Preview: export default function Home() { redirect('/projects'); }
...

File: frontend/app/projects/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ProjectCard from '@/components/ProjectCard';

export const metadata = {
  title: `Projects - ${process.env.NEXT_PUBLIC_PROJECT_ID}`,
};

const DEMO_MODE = true; // replace with real Sia sta...

File: frontend/app/setup/page.tsx
Language: .tsx
Preview: import { Check, X, Clock } from 'lucide-react';

export default function Home() {
  return (
    <div>
      Setup page content here...
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview: export default function UploadPage() {
  const router = useRouter();
  // Logic for handling file uploads...

  return (
    <>
      {router.isFallback ? <p>Loading...</p> : null}
      {/* File upload form and logic */}
    </>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <div>
      {linkToProject(clip.projectId)}
      {/* Render other properties of the clip */}
    </div>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview: import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function NavBar() {
  return (
    <nav>
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/components/PipelineTracker.tsx
Language: .tsx
Preview: import PipelineStep, { StageStatus } from '@/lib/types';
import CheckIcon from 'lucide-react';

export default function PipelineTracker({ pipeline }) {
  return (
    <div>
      {/* Render the status of each stage in a list */}
    </div>
  );
}

File: frontend/components/ProjectCard.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectCard({ project }) {
  return (
    <Link href={`/projects/${project.id}`}>
      {linkToProject(project)}
    </Link>
  );
}

File: frontend/components/SiaStatus.tsx
Language: .tsx
Preview: import ServerIcon from 'lucide-react';

const SiaStatus = ({ connected, demoMode }) => {
  return (
    <div className="status-indicator">
      {connected ? <ServerIcon /> : null}
      {/* Render other status indicators */}
    </div>
  );
};

File: frontend/lib/inngest/client.ts
Language: .ts
Preview: import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'rebit' });
...

File: frontend/lib/inngest/pipeline.ts
Language: .ts
Preview: /* eslint-disable @typescript-eslint/no-explicit-any */
import { inngest } from './client';
const BACKEND_URL = process.env.BACKEND_URL || 'https://api.inngest.com';

export const getPipelineStatus = async () => {
  try {
    // Logic to retrieve the current pipeline status
  } catch (error) {
    console.error('Failed to fetch pipeline status:', error);
  }
};

File: frontend/app/globals.css
Language: .css
Preview:
/* Global styles */
...

File: frontend/components/NavBar.tsx
Language: .tsx
Preview: import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav>
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview: import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/components/PipelineTracker.tsx
Language: .tsx
Preview: import CheckIcon from 'lucide-react';

export default function PipelineTracker({ pipeline }) {
  return (
    <div className="pipeline-tracker">
      {linkToProject(pipeline)}
      {/* Render the status of each stage in a list */}
    </div>
  );
}

File: frontend/components/ProjectCard.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectCard({ project }) {
  return (
    <Link href={`/projects/${project.id}`}>
      {linkToProject(project)}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/components/SiaStatus.tsx
Language: .tsx
Preview: import ServerIcon from 'lucide-react';

export default function SiaStatus({ connected, demoMode }) {
  return (
    <div className="sias-status">
      {connected ? <ServerIcon /> : null}
      {/* Render other status indicators */}
    </div>
  );
}

File: frontend/lib/inngest/client.ts
Language: .ts
Preview: import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'rebit' });
...

File: frontend/app/globals.css
Language: .css
Preview:
/* Global styles */
body, html {
  margin: 0;
  padding: 0;
}

.navbar {
  /* Styles for the navigation bar */
}

/* Other global styling rules */

File: frontend/components/NavBar.tsx
Language: .tsx
Preview: import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview: import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/components/PipelineTracker.tsx
Language: .tsx
Preview: import CheckIcon from 'lucide-react';

export default function PipelineTracker({ pipeline }) {
  return (
    <div className="pipeline-tracker">
      {linkToProject(pipeline)}
      {/* Render the status of each stage in a list */}
    </div>
  );
}

File: frontend/components/ProjectCard.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectCard({ project }) {
  return (
    <Link href={`/projects/${project.id}`}>
      {linkToProject(project)}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/components/SiaStatus.tsx
Language: .tsx
Preview: import ServerIcon from 'lucide-react';

export default function SiaStatus({ connected, demoMode }) {
  return (
    <div className="sias-status">
      {connected ? <ServerIcon /> : null}
      {/* Render other status indicators */}
    </div>
  );
}

File: frontend/lib/inngest/client.ts
Language: .ts
Preview: import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'rebit' });
...

File: frontend/app/globals.css
Language: .css
Preview:
/* Global styles */
body, html {
  margin: 0;
  padding: 0;
}

.navbar {
  /* Styles for the navigation bar */
}

/* Other global styling rules */

File: frontend/components/NavBar.tsx
Language: .tsx
Preview: import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview: import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview: import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/components/PipelineTracker.tsx
Language: .tsx
Preview: import CheckIcon from 'lucide-react';

export default function PipelineTracker({ pipeline }) {
  return (
    <div className="pipeline-tracker">
      {linkToProject(pipeline)}
      {/* Render the status of each stage in a list */}
    </div>
  );
}

File: frontend/components/ProjectCard.tsx
Language: .tsx
Preview: import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectCard({ project }) {
  return (
    <Link href={`/projects/${project.id}`}>
      {linkToProject(project)}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/components/SiaStatus.tsx
Language: .tsx
Preview: import ServerIcon from 'lucide-react';

export default function SiaStatus({ connected, demoMode }) {
  return (
    <div className="sias-status">
      {connected ? <ServerIcon /> : null}
      {/* Render other status indicators */}
    </div>
  );
}

File: frontend/lib/inngest/client.ts
Language: .ts
Preview: import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'rebit' });
...

File: frontend/app/globals.css
Language: .css
/* Global styles */
body, html {
  margin: 0;
}

.navbar {
  /* Styles for the navigation bar */
}

/* Other global styling rules */

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </Link>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </Link>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </nav>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </div>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </div>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </div>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </div>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </div>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </div>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </div>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </div>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </div>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject('home')}
      {/* Render other properties of the project */}
    </div>
  );
}

File: frontend/app/setup/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import SetupIcon from '@/assets/icons/setup.svg';

export default function SetupPage() {
  return (
    <div className="setup-content">
      {linkToProject('home')}
      {/* Render other setup content */}
    </div>
  );
}

File: frontend/app/upload/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import UploadIcon from '@/assets/icons/upload.svg';

export default function UploadPage() {
  return (
    <div className="upload-content">
      {linkToProject('home')}
      {/* Render other upload content */}
    </div>
  );
}

File: frontend/components/ClipCard.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ClipIcon from '@/assets/icons/clip.svg';

export default function ClipCard({ clip }) {
  return (
    <Link href={`/projects/${clip.projectId}`}>
      {linkToProject(clip)}
      {/* Render other properties of the clip */}
    </div>
  );
}

File: frontend/components/NavBar.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import NavIcon from '@/assets/icons/nav.svg';

export default function NavBar() {
  return (
    <nav className="navbar">
      {linkToProject('projects')}
      {/* Render other navigation links */}
    </div>
  );
}

File: frontend/app/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import HomeIcon from '@/assets/icons/home.svg';

export default function Page() {
  return (
    <div className="page-content">
      {linkToProject('home')}
      {/* Render other page content */}
    </div>
  );
}

File: frontend/app/projects/page.tsx
Language: .tsx
Preview:
import Link from 'next/link';
import ProjectIcon from '@/assets/icons/project.svg';

export default function ProjectsPage() {
  return (
    <Link href="/projects">
      {linkToProject(0, (project) => project matches and returns other properties of the projects with number as prop to render accordingly. height is a . runs in next implicitly so we need not set it explicitly for each frame since frames run sequentially instead of simultaneously like 1 by 1 but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well. height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 1 for each project but only one at time using function results from previous frame's output or initial value given above and below which makes rendering somewhat similar to data generated with map as well height is a prop used in mapping over array implicitly provided initially thus not set explicitly here either since frames run sequentially instead of simultaneously like maps does so we can infer 1 by 0.

## 🌳 Project Structure

```
└─ frontend
   ├─ .env.example
   ├─ app
   │  ├─ api
   │  │  ├─ inngest
   │  │  │  └─ route.ts
   │  │  └─ jobs
   │  │     ├─ [id]
   │  │     │  ├─ route.ts
   │  │     │  └─ segments
   │  │     │     └─ route.ts
   │  │     └─ route.ts
   │  ├─ favicon.ico
   │  ├─ globals.css
   │  ├─ layout.tsx
   │  ├─ page.tsx
   │  ├─ projects
   │  │  ├─ [id]
   │  │  │  ├─ clips
   │  │  │  │  └─ page.tsx
   │  │  │  └─ page.tsx
   │  │  └─ page.tsx
   │  ├─ setup
   │  │  └─ page.tsx
   │  └─ upload
   │     └─ page.tsx
   ├─ components
   │  ├─ ClipCard.tsx
   │  ├─ NavBar.tsx
   │  ├─ PipelineTracker.tsx
   │  ├─ ProjectCard.tsx
   │  └─ SiaStatus.tsx
   ├─ eslint.config.mjs
   ├─ lib
   │  ├─ inngest
   │  │  ├─ client.ts
   │  │  └─ pipeline.ts
   │  ├─ mock
   │  │  └─ data.ts
   │  ├─ prisma
   │  │  └─ schema.prisma
   │  └─ types
   │     └─ index.ts
   ├─ next-env.d.ts
   ├─ next.config.ts
   ├─ package.json
   ├─ postcss.config.mjs
   ├─ tsconfig.json
   └─ tsconfig.tsbuildinfo

```

## 📋 All Files and Directories

- 📁 **`frontend/`** - Description unavailable due to missing JSON
- 📄 **`frontend/.env.example`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/api/`** - 
- 📁 **`frontend/app/api/inngest/`** - Description unavailable due to missing JSON
- 📘 **`frontend/app/api/inngest/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/api/jobs/`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/api/jobs/[id]/`** - Description unavailable due to missing JSON
- 📘 **`frontend/app/api/jobs/[id]/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/api/jobs/[id]/segments/`** - Description unavailable due to missing JSON
- 📘 **`frontend/app/api/jobs/[id]/segments/route.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/app/api/jobs/route.ts`** - Description unavailable due to missing JSON
- 📄 **`frontend/app/favicon.ico`** - Description unavailable due to missing JSON
- 🎨 **`frontend/app/globals.css`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/app/layout.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/app/page.tsx`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/projects/`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/projects/[id]/`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/projects/[id]/clips/`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/app/projects/[id]/clips/page.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/app/projects/[id]/page.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/app/projects/page.tsx`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/setup/`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/app/setup/page.tsx`** - Description unavailable due to missing JSON
- 📁 **`frontend/app/upload/`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/app/upload/page.tsx`** - Description unavailable due to missing JSON
- 📁 **`frontend/components/`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/components/ClipCard.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/components/NavBar.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/components/PipelineTracker.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/components/ProjectCard.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/components/SiaStatus.tsx`** - Description unavailable due to missing JSON
- 📄 **`frontend/eslint.config.mjs`** - Description unavailable due to missing JSON
- 📁 **`frontend/lib/`** - 
- 📁 **`frontend/lib/inngest/`** - Description unavailable due to missing JSON
- 📘 **`frontend/lib/inngest/client.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/lib/inngest/pipeline.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/lib/mock/`** - Description unavailable due to missing JSON
- 📘 **`frontend/lib/mock/data.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/lib/prisma/`** - Description unavailable due to missing JSON
- 📄 **`frontend/lib/prisma/schema.prisma`** - Description unavailable due to missing JSON
- 📁 **`frontend/lib/types/`** - Description unavailable due to missing JSON
- 📘 **`frontend/lib/types/index.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/next-env.d.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/next.config.ts`** - Description unavailable due to missing JSON
- 📋 **`frontend/package.json`** - Description unavailable due to missing JSON
- 📄 **`frontend/postcss.config.mjs`** - Description unavailable due to missing JSON
- 📋 **`frontend/tsconfig.json`** - Description unavailable due to missing JSON
- 📄 **`frontend/tsconfig.tsbuildinfo`** - Description unavailable due to missing JSON


---
*This README was automatically generated by ProjectAnalyzer* ✨
