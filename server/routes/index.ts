import type { Express } from 'express';
import type { google } from 'googleapis';
import { createAuthRouter } from './auth';
import usersRouter from './users';
import channelConfigsRouter from './channelConfigs';
import inventoryRouter from './inventory';
import systemConfigRouter from './systemConfig';
import storePocMappingsRouter from './storePocMappings';
import uploadLogsRouter from './uploadLogs';
import poActionsRouter from './poActions';
import packingDataRouter from './packingData';

// Mounts the new Supabase-backed API surface (Phase B: core CRUD + real auth) onto an
// existing Express app. Used by both server.ts (local dev) and api/index.ts (Vercel)
// so the route set never drifts between the two entry points.
//
// This REPLACES the old /api/login-google handler with one that looks up real roles
// from Supabase instead of hardcoding every @cubelelo.com login to Admin -- register
// this before any other /api/login-google handler in the calling file, or remove the
// old one entirely.
export function registerApiV2Routes(app: Express, oauth2Client: InstanceType<typeof google.auth.OAuth2>) {
  app.use(createAuthRouter(oauth2Client));
  app.use(usersRouter);
  app.use(channelConfigsRouter);
  app.use(inventoryRouter);
  app.use(systemConfigRouter);
  app.use(storePocMappingsRouter);
  app.use(uploadLogsRouter);
  app.use(poActionsRouter);
  app.use(packingDataRouter);
}
