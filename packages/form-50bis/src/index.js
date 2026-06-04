import cssText from './generated/form.scoped.css?inline';
import Form50Bis from './Form50Bis.vue';

// Inject the scoped, self-contained stylesheet once when the module loads in a browser.
if (typeof document !== 'undefined' && !document.getElementById('tff-50bis-styles')) {
  const s = document.createElement('style');
  s.id = 'tff-50bis-styles';
  s.textContent = cssText;
  document.head.appendChild(s);
}
export { Form50Bis };
export default Form50Bis;
