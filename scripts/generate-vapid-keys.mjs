#!/usr/bin/env node
/**
 * Prints a fresh VAPID key pair for Web Push.
 *
 *   npm run push:keys
 *
 * Nothing is written to disk: copy the two values into your environment (in
 * Vercel: Project → Settings → Environment Variables). The private key is a
 * signing secret — treat it like a password, never commit it, and never put it
 * in a variable prefixed with NEXT_PUBLIC_.
 *
 * Rotating the keys invalidates every existing subscription; browsers will
 * re-subscribe with the new key the next time a player turns notifications on.
 */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('\nAdd these to your environment:\n');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com\n');
console.log('Keep VAPID_PRIVATE_KEY secret. Only the public key may reach the browser.\n');
