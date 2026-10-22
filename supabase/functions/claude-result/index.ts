import { createResultHandler } from '../_shared/claude-routine.mjs';

// Each result must present its 256-bit, expiring, one-run callback credential.
Deno.serve(createResultHandler({ env: Deno.env.toObject() }));
