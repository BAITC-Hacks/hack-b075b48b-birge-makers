// Compatibility entry point: the current API contract suite includes this coverage.
import('./test/api.test.mjs').catch(error=>{ console.error(error); process.exitCode=1; });
