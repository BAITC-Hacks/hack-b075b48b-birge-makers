import { createApp } from '../src/server.js';
import { loadCatalog, loadIndex } from '../src/storage.js';
const server = createApp(await loadCatalog(), await loadIndex());
server.listen(3107,'127.0.0.1');
