import { createFileRoute, Link } from '@tanstack/react-router';
import { cn } from '@/lib/cn';
import { cva } from 'class-variance-authority';
import {
  BatteryChargingIcon,
  FileIcon,
  FileTextIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
  BarChart3,
  Globe,
  Palette,
  GitBranch,
  Zap,
  GitPullRequest
} from 'lucide-react';
import { DynamicCodeBlock as ServerCodeBlock } from 'chrona-ui/components/dynamic-codeblock';
import {
  Hero,
  AgnosticBackground,
  CreateAppAnimation,
  PreviewImages,
  Writing,
} from './-page.client';
import ShadcnImage from './shadcn.png';
import { owner, repo } from '@/lib/github';
import StoryImage from './story.png';
import CLIImage from './cli.png';
import Bg2Image from './bg-2.png';
const story = { WithControl: () => null };

const Image = ({ priority, unoptimized, ...props }: any) => <img {...props} />;

const headingVariants = cva('font-medium tracking-tight', {
  variants: {
    variant: {
      h2: 'text-3xl lg:text-4xl',
      h3: 'text-xl lg:text-2xl',
    },
  },
});

const buttonVariants = cva(
  'inline-flex justify-center px-5 py-3 rounded-full font-medium tracking-tight transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-foreground hover:bg-brand-200',
        secondary: 'border bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

const cardVariants = cva('rounded-2xl text-sm p-6 bg-origin-border shadow-lg', {
  variants: {
    variant: {
      secondary: 'bg-brand-secondary text-brand-secondary-foreground',
      default: 'border bg-fd-card',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export const Route = createFileRoute('/_home/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="text-landing-foreground pt-4 pb-6 dark:text-landing-foreground-dark md:pb-12">
      <div className="relative flex min-h-[600px] h-[70vh] max-h-[900px] border rounded-2xl overflow-hidden mx-auto w-full max-w-[1400px] bg-origin-border">
        <Hero />
        <div className="flex flex-col z-2 px-4 size-full md:p-12 max-md:items-center max-md:text-center">
          <p className="mt-12 text-xs text-brand font-medium rounded-full p-2 border border-brand/50 w-fit">
            the React.js docs framework you love.
          </p>
          <h1 className="text-4xl my-8 leading-tighter font-medium xl:text-5xl xl:mb-12">
            Build excellent
            <br className="md:hidden" /> documentation,
            <br />
            <br />
            your <span className="text-brand">docs</span>.
          </h1>
          <div className="flex flex-row items-center justify-center gap-4 flex-wrap w-fit">
            <Link to="/docs/$" params={{ _splat: '' }} className={cn(buttonVariants(), 'max-sm:text-sm')}>
              Get Started Free
            </Link>
            <a
              href="/dashboard"
              className={cn(buttonVariants({ variant: 'secondary' }), 'max-sm:text-sm')}
            >
              See Demo →
            </a>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-10 mt-12 px-6 mx-auto w-full max-w-[1400px] md:px-12 lg:grid-cols-2 lg:mt-20">
        <p className="text-2xl tracking-tight leading-snug font-light col-span-full md:text-3xl xl:text-4xl">
          Chrona is the documentation platform that turns your Markdown into a <span className="text-brand font-medium">stunning, searchable docs site</span> — deployed globally on the edge with <span className="text-brand font-medium">AI-powered search</span>, <span className="text-brand font-medium">analytics</span>, and <span className="text-brand font-medium">custom branding</span> built in.
        </p>
        <div className="relative p-4 rounded-2xl col-span-full z-2 overflow-hidden md:p-8">
          <Image
            src={CLIImage}
            alt=""
            className="absolute inset-0 size-full object-top object-cover -z-1"
          />
          <div className="mx-auto w-full max-w-[800px] p-2 bg-fd-card text-fd-card-foreground border rounded-2xl shadow-lg">
            <div className="flex flex-row gap-2">
              <h2 className="text-brand content-center font-mono font-bold uppercase border-2 border-brand/50 px-2 rounded-xl">
                Try it out
              </h2>
              <ServerCodeBlock
                code="pnpm create chrona-app"
                lang="bash"
                codeblock={{
                  className: 'bg-fd-secondary flex-1',
                }}
              />
            </div>

            <div className="relative bg-fd-secondary rounded-xl mt-2 border shadow-md">
              <div className="flex flex-row items-center gap-2 border-b p-2 text-fd-muted-foreground">
                <TerminalIcon className="size-4" />
                <span className="text-xs font-medium">Terminal</span>
                <div className="ms-auto me-2 size-2 rounded-full bg-red-400" />
              </div>

              <CreateAppAnimation className="p-2 text-fd-secondary-foreground/80" />
            </div>
          </div>
        </div>
        <Aesthetics />

        <AnybodyCanWrite />

        <ProductFeatures />
        <BuiltForTeams />
        <FinalCTA />
      </div>
    </main>
  );
}

function BuiltForTeams() {
  return (
    <>
      <h2
        className={cn(
          headingVariants({
            variant: 'h2',
            className: 'mt-8 text-brand text-center mb-4 col-span-full',
          }),
        )}
      >
        Built for modern teams.
      </h2>

      <div className={cn(cardVariants({ className: 'flex flex-col' }))}>
        <GitBranch className="text-brand mb-4" />
        <h3
          className={cn(
            headingVariants({
              variant: 'h3',
              className: 'mb-6',
            }),
          )}
        >
          Git-backed workflow.
        </h3>
        <p className="mb-8">
          Write docs in Markdown, commit to GitHub, and we handle the rest.
          <br />
          <br />
          Chrona automatically previews every pull request, allowing your entire team to review documentation changes before they go live.
        </p>
        <div className="flex flex-row items-center gap-2">
          <a
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'primary' }))}
          >
            Connect GitHub
          </a>
        </div>
      </div>
      
      <div className={cn(cardVariants({ className: 'flex flex-col bg-fd-secondary text-fd-secondary-foreground' }))}>
        <BarChart3 className="text-brand-secondary mb-4" />
        <h3
          className={cn(
            headingVariants({
              variant: 'h3',
              className: 'mb-6',
            }),
          )}
        >
          Insights that matter.
        </h3>
        <p className="mb-8">
          Understand what your users are searching for and where they are getting stuck. Chrona's built-in analytics provides actionable insights to improve your docs.
        </p>
        <ServerCodeBlock
          lang="json"
          codeblock={{ title: 'chrona.json' }}
          code={`{
  "analytics": {
    "enabled": true,
    "provider": "chrona",
    "trackSearches": true,
    "trackPageviews": true
  }
}`}
        />
      </div>
    </>
  );
}

function Story() {
  return (
    <div className="relative col-span-full min-h-[570px] px-2 py-6 rounded-2xl z-2 border shadow-md">
      <Image
        src={StoryImage}
        alt=""
        className="absolute inset-0 size-full -z-1 pointer-events-none object-cover object-top rounded-2xl"
      />

      <div className="w-full m-auto max-w-[500px] text-start shadow-xl p-2 bg-fd-card/80 backdrop-blur-md rounded-xl border shadow-black/50 dark:bg-fd-card/50">
        <div className="pt-3 px-3">
          <h2
            className={cn(
              headingVariants({
                className: 'mb-4',
                variant: 'h3',
              }),
            )}
          >
            Chrona Story
          </h2>
          <p className="text-sm mb-4">
            Built for UI component libraries – bring an interactive playground to showcase your
            components vividly.
          </p>
          <a
            href="/docs/integrations/story"
            className={cn(buttonVariants({ variant: 'primary', className: 'text-sm py-2 mb-4' }))}
          >
            Explore
          </a>
        </div>
        <story.WithControl />
      </div>
    </div>
  );
}

function Aesthetics() {
  return (
    <>
      <div
        className={cn(
          cardVariants({
            variant: 'secondary',
            className: 'flex items-center justify-center p-0',
          }),
        )}
      >
        <PreviewImages />
      </div>
      <div className={cn(cardVariants(), 'flex flex-col')}>
        <h3 className={cn(headingVariants({ variant: 'h3', className: 'mb-6' }))}>
          Minimal aesthetics, Maximum customizability.
        </h3>
        <p className="mb-4">
          Chrona offer well-designed themes, with a headless mode to plug your own UI.
        </p>
        <p className="mb-4">Pro designer? Customize the theme using Chrona CLI.</p>
        <ServerCodeBlock
          code={`pnpm dlx @chrona/cli customize\n\n> Choose a layout to customize...`}
          lang="bash"
        />
      </div>
    </>
  );
}

function AnybodyCanWrite() {
  return (
    <Writing
      tabs={{
        writer: (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ServerCodeBlock
              code={`---
title: Hello World
---

## Overview

I love **Chrona**!

\`\`\`ts tab="Tab 1"
console.log("Hello World")
\`\`\`

\`\`\`ts tab="Tab 2"
return 0;
\`\`\``}
              lang="mdx"
            />
            <div className="max-lg:row-start-1">
              <h3 className={cn(headingVariants({ variant: 'h3', className: 'my-4' }))}>
                The familiar syntax.
              </h3>
              <p>
                It is just Markdown, with additional features seamlessly composing into the syntax.
              </p>
              <ul className="text-xs list-disc list-inside mt-8">
                <li>Markdown features, including images</li>
                <li>Syntax highlighting (Powered by Shiki)</li>
                <li>Codeblock Groups</li>
                <li>Callouts</li>
                <li>Cards</li>
                <li>Custom Heading Anchors</li>
                <li>Auto Table of Contents</li>
              </ul>
            </div>
          </div>
        ),
        developer: (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ServerCodeBlock
              code={`---
title: Hello World
---

import { Playground } from "@/components/playground";

## Overview

<Playground title="Test" />

This codeblock shows TypeScript information!

\`\`\`ts twoslash
console.log("Hello World");

// give your code decorations [!code ++]
const name = "chrona";
\`\`\`

And re-use content:

<include>./another-page.mdx</include>`}
              lang="mdx"
            />
            <div className="max-lg:row-start-1">
              <h3 className={cn(headingVariants({ variant: 'h3', className: 'my-4' }))}>
                Extensive but simple.
              </h3>
              <p>MDX for developers authoring content, use JavaScript in content.</p>
              <ul className="text-xs list-disc list-inside mt-8">
                <li>JavaScript + JSX syntax</li>
                <li>Custom Components</li>
                <li>Include/Embed Content</li>
                <li>TypeScript Twoslash: show type information in codeblocks.</li>
                <li>Shiki Notations</li>
                <li>Storybook integration to showcase components.</li>
                <li>Extend via remark, rehype plugins</li>
              </ul>
            </div>
          </div>
        ),
        automation: (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ServerCodeBlock
              code={`---
title: Hello World
---

import { db } from "@/lib/db";

export async function DataView() {
  const products = await db.select().from("products");
  return products.map(product => <div key={product.id}>{product.name}</div>)
}

<DataView />

<auto-type-table path='./my-file.ts' name='CardProps' />`}
              lang="tsx"
            />

            <div className="max-lg:row-start-1">
              <h3 className={cn(headingVariants({ variant: 'h3', className: 'my-4' }))}>
                Content, always up-to-date.
              </h3>
              <p>
                Combining the power of MDX and React Server Components, use the latest data from
                database, server — anywhere, to be part of your content.
              </p>
              <ul className="text-xs list-disc list-inside mt-8">
                <li>Works on React Server Components</li>
                <li>Display data from database, CMS, anything</li>
                <li>auto-type-table for documenting types based on TypeScript Compiler</li>
                <li>OpenAPI playground for documenting your APIs</li>
              </ul>
            </div>
          </div>
        ),
      }}
    />
  );
}

function ProductFeatures() {
  return (
    <>
      <h2
        className={cn(
          headingVariants({
            variant: 'h2',
            className: 'text-brand text-center mb-4 col-span-full mt-12',
          }),
        )}
      >
        Everything you need to scale docs.
      </h2>

      <div className={cn(cardVariants(), 'relative flex flex-col overflow-hidden z-2')}>
        <div className="flex items-center gap-4 mb-6">
          <Globe className="size-8 text-brand" />
          <h3 className={cn(headingVariants({ variant: 'h3' }))}>Global Edge CDN</h3>
        </div>
        <p className="mb-8 flex-1">
          Your documentation is deployed to 300+ edge locations globally, ensuring sub-100ms load times for your users anywhere in the world.
        </p>
        <div className="bg-fd-secondary rounded-xl p-4 overflow-hidden border">
          <div className="flex justify-between text-xs text-fd-muted-foreground mb-2">
            <span>US East</span>
            <span className="text-brand">12ms</span>
          </div>
          <div className="w-full bg-fd-border h-1.5 rounded-full mb-4">
            <div className="bg-brand h-1.5 rounded-full w-[15%]"></div>
          </div>
          
          <div className="flex justify-between text-xs text-fd-muted-foreground mb-2">
            <span>EU West</span>
            <span className="text-brand-secondary">24ms</span>
          </div>
          <div className="w-full bg-fd-border h-1.5 rounded-full mb-4">
            <div className="bg-brand-secondary h-1.5 rounded-full w-[25%]"></div>
          </div>
          
          <div className="flex justify-between text-xs text-fd-muted-foreground mb-2">
            <span>Asia Pacific</span>
            <span className="text-brand">42ms</span>
          </div>
          <div className="w-full bg-fd-border h-1.5 rounded-full">
            <div className="bg-brand h-1.5 rounded-full w-[45%]"></div>
          </div>
        </div>
      </div>

      <div className={cn(cardVariants(), 'flex flex-col')}>
        <div className="flex items-center gap-4 mb-6">
          <Palette className="size-8 text-brand-secondary" />
          <h3 className={cn(headingVariants({ variant: 'h3' }))}>Brand Customization</h3>
        </div>
        <p className="mb-8">
          Match your documentation to your brand instantly. No CSS required. Choose your colors, typography, and layout from a simple dashboard.
        </p>
        <ServerCodeBlock
          lang="json"
          codeblock={{ title: 'theme.json' }}
          code={`{
  "colors": {
    "primary": "#c026d3",
    "background": "#000000"
  },
  "typography": {
    "fontFamily": "Inter"
  },
  "logo": {
    "light": "/logo-light.svg",
    "dark": "/logo-dark.svg"
  }
}`}
        />
      </div>

      <div className={cn(cardVariants(), 'flex flex-col')}>
        <div className="flex items-center gap-4 mb-6">
          <Zap className="size-8 text-fd-success" />
          <h3 className={cn(headingVariants({ variant: 'h3' }))}>AI Search Built-in</h3>
        </div>
        <p className="mb-4">
          Stop struggling with search configuration. Chrona automatically vectorizes your content and provides AI-powered semantic search out of the box.
        </p>
        <p className="mb-8 text-sm text-fd-muted-foreground">
          Powered by edge embeddings and optimized for developer documentation.
        </p>
        
        <div className="flex select-none flex-col mt-auto bg-fd-popover rounded-xl border">
          <div className="inline-flex items-center gap-2 px-4 py-3 text-sm text-fd-muted-foreground border-b">
            <SearchIcon className="size-4 text-brand" />
            <span className="text-brand font-medium">How do I authenticate?</span>
          </div>
          <div className="p-4 bg-brand/5">
            <p className="text-sm">
              <strong className="text-brand">AI Answer:</strong> You can authenticate by generating an API key in your dashboard and passing it via the <code>Authorization: Bearer &lt;token&gt;</code> header.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function FinalCTA() {
  return (
    <div className={cn(cardVariants({ className: 'col-span-full flex flex-col items-center justify-center p-12 text-center bg-gradient-to-br from-brand/20 to-brand-secondary/20 border-brand/30' }))}>
      <h2 className="text-3xl font-bold mb-4">Ready to upgrade your docs?</h2>
      <p className="text-fd-muted-foreground mb-8 max-w-[600px]">
        Join thousands of modern teams building beautiful, fast, and searchable documentation with Chrona.
      </p>
      <div className="flex gap-4">
        <Link to="/docs/$" params={{ _splat: '' }} className={cn(buttonVariants())}>
          Start Building Free
        </Link>
        <a href="/dashboard" className={cn(buttonVariants({ variant: 'secondary' }))}>
          View Dashboard
        </a>
      </div>
    </div>
  );
}

