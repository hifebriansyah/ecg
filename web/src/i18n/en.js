// English texts, keyed by the Indonesian source string. Split by area to keep each file short.
import shared from './en.shared.js';
import sessions from './en.sessions.js';
import master from './en.master.js';
import docsGuide from './en.docs.guide.js';
import docsRisk from './en.docs.risk.js';
import simulator from './en.simulator.js';

export default { ...shared, ...sessions, ...master, ...docsGuide, ...docsRisk, ...simulator };
