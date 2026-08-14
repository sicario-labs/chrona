import { createFileRoute } from '@tanstack/react-router';
import { cn } from '@/lib/cn';
import { cva } from 'class-variance-authority';
import { CheckCircle2, Zap } from 'lucide-react';

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

const cardVariants = cva('rounded-2xl text-sm p-8 bg-origin-border shadow-lg relative overflow-hidden', {
  variants: {
    variant: {
      secondary: 'bg-brand-secondary text-brand-secondary-foreground',
      default: 'border bg-fd-card',
      highlight: 'border-2 border-brand bg-fd-card',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export const Route = createFileRoute('/_home/pricing')({
  component: PricingPage,
});

function PricingPage() {
  return (
    <main className="text-landing-foreground pt-12 pb-24 dark:text-landing-foreground-dark">
      <div className="mx-auto w-full max-w-[1200px] px-6 md:px-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-fd-muted-foreground max-w-[600px] mx-auto">
            Everything you need to build and scale your documentation, backed by Bachs.io billing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Starter Plan */}
          <div className={cn(cardVariants())}>
            <h3 className={cn(headingVariants({ variant: 'h3' }), 'mb-2')}>Starter</h3>
            <p className="text-fd-muted-foreground mb-6 h-[40px]">Perfect for open source and side projects.</p>
            <div className="mb-8">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-fd-muted-foreground">/mo</span>
            </div>
            <a href="/dashboard" className={cn(buttonVariants({ variant: 'secondary' }), 'w-full mb-8')}>
              Get Started Free
            </a>
            <ul className="space-y-4 text-sm">
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> Up to 5 team members</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> Unlimited public projects</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> Standard edge network</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> Basic search</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> Community support</li>
            </ul>
          </div>

          {/* Pro Plan */}
          <div className={cn(cardVariants({ variant: 'highlight' }))}>
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand to-brand-secondary" />
            <div className="absolute top-4 right-4 bg-brand/10 text-brand px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
              <Zap className="size-3" /> Most Popular
            </div>
            <h3 className={cn(headingVariants({ variant: 'h3' }), 'mb-2')}>Pro</h3>
            <p className="text-fd-muted-foreground mb-6 h-[40px]">For professional teams scaling their docs.</p>
            <div className="mb-8">
              <span className="text-4xl font-bold">$49</span>
              <span className="text-fd-muted-foreground">/mo per project</span>
            </div>
            <a href="/dashboard" className={cn(buttonVariants({ variant: 'primary' }), 'w-full mb-8')}>
              Start 14-Day Trial
            </a>
            <ul className="space-y-4 text-sm">
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-brand shrink-0" /> Everything in Starter</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-brand shrink-0" /> Unlimited team members</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-brand shrink-0" /> Private GitHub repos</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-brand shrink-0" /> AI-Powered Search</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-brand shrink-0" /> Priority email support</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-brand shrink-0" /> Advanced analytics</li>
            </ul>
          </div>

          {/* Enterprise Plan */}
          <div className={cn(cardVariants())}>
            <h3 className={cn(headingVariants({ variant: 'h3' }), 'mb-2')}>Enterprise</h3>
            <p className="text-fd-muted-foreground mb-6 h-[40px]">Custom solutions for large organizations.</p>
            <div className="mb-8">
              <span className="text-4xl font-bold">Custom</span>
            </div>
            <a href="mailto:sales@chrona.dev" className={cn(buttonVariants({ variant: 'secondary' }), 'w-full mb-8')}>
              Contact Sales
            </a>
            <ul className="space-y-4 text-sm">
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> Everything in Pro</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> SSO & SAML</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> Custom SLAs</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> Dedicated account manager</li>
              <li className="flex gap-3"><CheckCircle2 className="size-5 text-fd-success shrink-0" /> On-premise deployment</li>
            </ul>
          </div>
        </div>

        <div className="mt-24 text-center">
          <h2 className="text-2xl font-semibold mb-4">Powered by Bachs.io</h2>
          <p className="text-fd-muted-foreground max-w-[600px] mx-auto">
            Our billing infrastructure is securely handled by Bachs.io, ensuring your payment data is safe and subscriptions are managed efficiently.
          </p>
        </div>
      </div>
    </main>
  );
}
