import { colorFor } from '@coalesce/board';

const ADJECTIVES = ['Swift', 'Calm', 'Bright', 'Bold', 'Keen', 'Warm', 'Lucid'];
const ANIMALS = ['Otter', 'Heron', 'Fox', 'Lynx', 'Wren', 'Hare', 'Finch'];

export interface LocalUser {
  name: string;
  color: string;
}

/** Derive a stable display name + palette color from an awareness client id. */
export function makeUser(seed: number): LocalUser {
  const adj = ADJECTIVES[Math.abs(seed) % ADJECTIVES.length];
  const animal = ANIMALS[Math.abs(seed >> 3) % ANIMALS.length];
  return { name: `${adj} ${animal}`, color: colorFor(seed) };
}
