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

export function getPartyColor(party: string, dominance: number = 1): string {
  // LDF -> Red, UDF -> Green, NDA -> Saffron, OTHER -> Gray
  // Base HSL values
  const colors: Record<string, { h: number; s: number; l: number }> = {
    'LDF': { h: 0, s: 85, l: 45 },      // Red
    'UDF': { h: 142, s: 71, l: 35 },    // Green
    'NDA': { h: 25, s: 95, l: 50 },     // Saffron
    'OTHER': { h: 215, s: 15, l: 65 },  // Gray
    'NONE': { h: 220, s: 20, l: 80 }    // Default empty
  };

  const base = colors[party] || colors['NONE'];
  
  // If dominance is low, it becomes less saturated or lower opacity
  // Dominance typically > 0.25 since there are 4 parties.
  // We can just use it for opacity calculation:
  const opacity = Math.min(Math.max((dominance - 0.2) * 1.5, 0.4), 1);
  return `hsla(${base.h}, ${base.s}%, ${base.l}%, ${opacity})`;
}
