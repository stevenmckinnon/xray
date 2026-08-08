'use client';

import { ClipboardIcon, ValidationIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useState } from 'react';

interface CopyCommandProps {
  manager: string;
  flags: string;
  pkg: string;
}

/**
 * The install command, as a single button.
 *
 * Three deliberate choices. The whole field copies, not just a small label at the
 * end, so the target is the size of the thing you are trying to hit. The command
 * is tinted so the package name reads as the payload and the flags recede. And
 * success is a state on the field itself, not a word swap you might miss.
 */
export function CopyCommand({ manager, flags, pkg }: CopyCommandProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const command = `${manager} ${flags} ${pkg}`;

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="command" data-state={state} onClick={copy} aria-label={`Copy: ${command}`}>
        <span className="command-rule" aria-hidden="true" />
        <code className="command-text">
          <span className="command-dim">{manager}</span>
          <span className="command-dim">{flags}</span>
          <span className="command-pkg">{pkg}</span>
        </code>
        <span className="command-action" aria-hidden="true">
          {/* HugeIcons takes strokeWidth, not Phosphor's `weight`. One value for
              the whole page so icons never disagree about their weight. */}
          {state === 'copied' ? (
            <HugeiconsIcon icon={ValidationIcon} size={13} strokeWidth={2} />
          ) : (
            <HugeiconsIcon icon={ClipboardIcon} size={13} strokeWidth={2} />
          )}
          <span className="command-action-label">{state === 'copied' ? 'copied' : 'copy'}</span>
        </span>
      </button>

      {/* Announced without moving anything: the field itself carries the visual state. */}
      <span className="command-status" role="status" data-state={state}>
        {state === 'copied'
          ? 'Copied to clipboard.'
          : state === 'failed'
            ? 'Could not reach the clipboard. Select the command and copy it.'
            : ''}
      </span>
    </div>
  );
}
