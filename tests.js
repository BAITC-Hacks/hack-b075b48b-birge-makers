// Run current frontend and proxy tests. Also available through npm test.
(async()=>{ await import('./test/api.test.mjs'); await import('./test/server.test.mjs'); })().catch(error=>{ console.error(error); process.exitCode=1; });
