'use client';

import { useEffect } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toHebrewError } from '@/lib/errors';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // The raw error stays in the logs; the user gets a Hebrew message.
  const { message } = toHebrewError(error);

  return (
    <PageShell>
      <div className="mt-16">
        <EmptyState
          emoji="⚠️"
          title="משהו השתבש"
          description={message}
          action={<Button onClick={reset}>נסו שוב</Button>}
        />
      </div>
    </PageShell>
  );
}
