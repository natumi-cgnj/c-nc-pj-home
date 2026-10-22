import { createBridgeHandler } from '../_shared/claude-routine.mjs';

// Auth is checked with Supabase Auth on every request, including modern JWTs.
Deno.serve(createBridgeHandler({ env: Deno.env.toObject() }));
