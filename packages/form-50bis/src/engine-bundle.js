// Load order matters: the UMD libs attach to window (BahtText/BuddhistDate),
// THEN form-engine reads them at its own load time and attaches window.FormEngine.
import '../../../public/lib/baht-text.js';
import '../../../public/lib/buddhist-date.js';
import '../../../public/lib/form-engine.js';
export const FormEngine = (typeof window !== 'undefined' ? window : globalThis).FormEngine;
