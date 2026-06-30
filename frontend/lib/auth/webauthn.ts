import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
} from '@simplewebauthn/server';
import { base64URLStringToBuffer } from '@simplewebauthn/browser';
import { prisma } from '@/lib/prisma/client';
import { createId } from '@paralleldrive/cuid2';

// Relying Party configuration
const RP_NAME = 'rebit';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Challenge Store (DB-backed) ───────────────────────────────────────

async function storeChallenge(key: string, challenge: string) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.passkeyChallenge.upsert({
    where: { key },
    update: { challenge, expiresAt },
    create: { key, challenge, expiresAt },
  });
}

async function getChallenge(key: string): Promise<string | null> {
  const record = await prisma.passkeyChallenge.findUnique({
    where: { key },
  });
  if (!record) return null;
  if (record.expiresAt < new Date()) {
    await prisma.passkeyChallenge.delete({ where: { key } });
    return null;
  }
  return record.challenge;
}

async function deleteChallenge(key: string) {
  await prisma.passkeyChallenge.delete({ where: { key } }).catch(() => {});
}

// ─── WebAuthn Config ───────────────────────────────────────────────────

function getWebauthnConfig() {
  return { rpID: RP_ID, origin: ORIGIN };
}

// ─── Registration (for already-logged-in users) ────────────────────────

export async function generatePasskeyRegistrationOptions(
  userId: string,
  userEmail: string,
  userName: string,
) {
  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId },
  });

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: userId,
    userName,
    userDisplayName: userEmail,
    attestationType: 'none',
    excludeCredentials: existingPasskeys.map((pk) => ({
      id: base64URLStringToBuffer(pk.credentialId),
      type: 'public-key' as const,
      transports: JSON.parse(pk.transports) as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
  };

  const options = await generateRegistrationOptions(opts);

  // Store challenge in DB
  await storeChallenge(`reg:${userId}`, options.challenge);

  return options;
}

export async function verifyPasskeyRegistrationResponse(
  userId: string,
  response: any,
  name?: string,
) {
  const expectedChallenge = await getChallenge(`reg:${userId}`);
  if (!expectedChallenge) {
    throw new Error('No registration challenge found. Please start registration again.');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration verification failed.');
  }

  const { credentialID, credentialPublicKey, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  // Store the passkey
  const credentialId = Buffer.from(credentialID).toString('base64url');
  await prisma.passkey.create({
    data: {
      id: credentialId,
      userId,
      credentialId,
      publicKey: Buffer.from(credentialPublicKey),
      counter: BigInt(0),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: '[]',
      name: name || `Passkey on ${credentialDeviceType}`,
    },
  });

  // Clean up challenge
  await deleteChallenge(`reg:${userId}`);

  return { verified: true };
}

// ─── First-Time Registration (no session required) ─────────────────────

export async function generateFirstTimePasskeyOptions() {
  const tempId = createId();

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: tempId,
    userName: 'New User',
    userDisplayName: 'New User',
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
  };

  const options = await generateRegistrationOptions(opts);

  // Store challenge with tempId
  await storeChallenge(`first-reg:${tempId}`, options.challenge);

  return { options, tempId };
}

export async function verifyFirstTimePasskeyRegistration(
  tempId: string,
  response: any,
) {
  const expectedChallenge = await getChallenge(`first-reg:${tempId}`);
  if (!expectedChallenge) {
    throw new Error('Registration challenge expired or not found. Please try again.');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration verification failed.');
  }

  const { credentialID, credentialPublicKey, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  // Create user
  const user = await prisma.user.create({
      data: {
        name: 'User',
        email: `passkey-${createId()}@noemail.invalid`,
      },
  });

  // Store the passkey
  const credentialId = Buffer.from(credentialID).toString('base64url');
  await prisma.passkey.create({
    data: {
      id: credentialId,
      userId: user.id,
      credentialId,
      publicKey: Buffer.from(credentialPublicKey),
      counter: BigInt(0),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: '[]',
      name: `Passkey on ${credentialDeviceType}`,
    },
  });

  // Clean up challenge
  await deleteChallenge(`first-reg:${tempId}`);

  return { verified: true, user };
}

// ─── Authentication (Sign-In) ──────────────────────────────────────────

export async function generatePasskeyAuthenticationOptions() {
  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: RP_ID,
    userVerification: 'required',
  };

  const options = await generateAuthenticationOptions(opts);

  // Store challenge in DB
  await storeChallenge(`auth:${options.challenge}`, options.challenge);

  return options;
}

export async function verifyPasskeyAuthenticationResponse(response: any) {
  // Extract challenge from clientDataJSON
  const clientData = JSON.parse(
    Buffer.from(response.response.clientDataJSON, 'base64url').toString(),
  );
  const challengeFromClient = clientData.challenge;

  const expectedChallenge = await getChallenge(`auth:${challengeFromClient}`);
  if (!expectedChallenge) {
    throw new Error('Authentication challenge expired or not found. Please try again.');
  }

  // Find the passkey by credential ID
  const credentialId = response.id;
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId },
    include: { user: true },
  });

  if (!passkey) {
    await deleteChallenge(`auth:${challengeFromClient}`);
    throw new Error('Passkey not found. Please enroll this device first.');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    authenticator: {
      credentialID: new Uint8Array(base64URLStringToBuffer(passkey.credentialId)),
      credentialPublicKey: new Uint8Array(passkey.publicKey),
      counter: Number(passkey.counter),
      transports: JSON.parse(passkey.transports) as AuthenticatorTransport[],
    },
  });

  // Clean up challenge
  await deleteChallenge(`auth:${challengeFromClient}`);

  if (!verification.verified) {
    throw new Error('Passkey authentication verification failed.');
  }

  // Update the counter and lastUsedAt
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });

  return {
    verified: true,
    user: {
      id: passkey.user.id,
      email: passkey.user.email,
      name: passkey.user.name,
      image: passkey.user.image,
    },
  };
}