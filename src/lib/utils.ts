import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import fpPromise from '@fingerprintjs/fingerprintjs';

let cachedFingerprint: string | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  
  let hash = localStorage.getItem('device_fingerprint');
  if (!hash) {
    // Generate actual device fingerprint
    const fp = await fpPromise.load();
    const result = await fp.get();
    hash = result.visitorId;
    localStorage.setItem('device_fingerprint', hash);
  }
  
  cachedFingerprint = hash;
  return hash;
}

export function getPartyColor(party: string, _dominance: number = 1): string {
  const colors: Record<string, string> = {
    'LDF': '#ef4444',     // red-500
    'UDF': '#22c55e',     // green-500
    'NDA': '#f97316',     // orange-500
    'OTHER': '#64748b',   // slate-500
    'NONE': 'transparent'
  };

  return colors[party] || colors['NONE'];
}
