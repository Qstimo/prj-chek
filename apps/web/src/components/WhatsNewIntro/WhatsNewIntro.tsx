'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { WhatsNewScreen } from '@/app/(app)/whats-new/WhatsNewScreen';
import { Drawer, DrawerWidth } from '@/components/Drawer';

const SEEN_KEY = 'cairn:whats-new-seen';

/** Показывает «Что нового» один раз, дальше остаётся маленькая плашка. */
export function WhatsNewIntro() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isSeen, setIsSeen] = useState(true);

  useEffect(() => {
    const seen = window.localStorage.getItem(SEEN_KEY) === '1';

    if (pathname === '/whats-new') {
      window.localStorage.setItem(SEEN_KEY, '1');
      setIsSeen(true);
      setIsOpen(false);

      return;
    }

    setIsSeen(seen);
    setIsOpen(!seen);
  }, [pathname]);

  function close() {
    window.localStorage.setItem(SEEN_KEY, '1');
    setIsSeen(true);
    setIsOpen(false);
  }

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={close}
        title="Что нового"
        width={DrawerWidth.Half}
      >
        <WhatsNewScreen />
      </Drawer>

      {isSeen && !isOpen && (
        <Link
          href="/whats-new"
          className="fixed bottom-4 right-4 z-40 rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-surface"
        >
          Что нового
        </Link>
      )}
    </>
  );
}
